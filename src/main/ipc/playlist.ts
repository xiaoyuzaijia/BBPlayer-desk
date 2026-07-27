// playlist 模块 IPC handler
// 只负责注册 IPC 通道 + 调 playlistService / syncBilibiliPlaylistFacade，不直接碰 db
// 业务编排集中在 src/main/lib/facades/ 和 src/main/lib/services/
//
// 主进程内部类型用 Date，跨 IPC 时统一转 number（ms epoch）
// 错误：service/facade/bilibili 三类错误统一映射为 PlaylistErrorCode
import { ipcMain, type BrowserWindow } from 'electron'

import { PLAYLIST_CHANNELS } from '../../shared/ipc-channels'
import type {
  CreateLocalPlaylistPayload,
  GetTracksPaginatedOptions,
  Playlist,
  PlaylistErrorCode,
  PlaylistTracksPaginated,
  PlaylistWithMetadata,
  ReorderTrackPayload,
  Result,
  Track,
  UpdatePlaylistPayload,
} from '../../shared/ipc-types'
import { BilibiliApiError } from '../lib/errors/bilibili'
import { DatabaseError, FacadeError, ServiceError } from '../lib/errors'
import { syncBilibiliPlaylistFacade } from '../lib/facades/syncBilibiliPlaylist'
import type { SyncProgressCb } from '../lib/facades/syncBilibiliPlaylist'
import { getPlaylistService } from '../lib/services'
import type {
  Artist as ServiceArtist,
  Playlist as ServicePlaylist,
  Track as ServiceTrack,
} from '../lib/services/types'

// ##################################
// 主进程内部类型 → IPC 共享类型 转换器
// Date → number (ms epoch)
// ##################################

function toIpcArtist(a: ServiceArtist | null): import('../../shared/ipc-types').Artist | null {
  if (!a) return null
  return {
    id: a.id,
    name: a.name,
    avatarUrl: a.avatarUrl,
    signature: a.signature,
    source: a.source,
    remoteId: a.remoteId,
    createdAt: a.createdAt.getTime(),
    updatedAt: a.updatedAt.getTime(),
  }
}

function toIpcTrack(t: ServiceTrack): Track {
  const base = {
    id: t.id,
    uniqueKey: t.uniqueKey,
    title: t.title,
    artist: toIpcArtist(t.artist),
    coverUrl: t.coverUrl,
    source: t.source,
    duration: t.duration,
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  }
  if (t.source === 'bilibili') {
    return {
      ...base,
      source: 'bilibili',
      bilibiliMetadata: {
        bvid: t.bilibiliMetadata.bvid,
        cid: t.bilibiliMetadata.cid,
        isMultiPage: t.bilibiliMetadata.isMultiPage,
        videoIsValid: t.bilibiliMetadata.videoIsValid,
        mainTrackTitle: t.bilibiliMetadata.mainTrackTitle,
      },
    }
  }
  return {
    ...base,
    source: 'local',
    localMetadata: { localPath: t.localMetadata.localPath },
  }
}

function toIpcPlaylist(p: ServicePlaylist): Playlist {
  return {
    id: p.id,
    title: p.title,
    author: toIpcArtist(p.author),
    description: p.description,
    coverUrl: p.coverUrl,
    itemCount: p.itemCount,
    type: p.type,
    remoteSyncId: p.remoteSyncId,
    lastSyncedAt: p.lastSyncedAt ? p.lastSyncedAt.getTime() : null,
    isPinned: p.isPinned,
    createdAt: p.createdAt.getTime(),
    updatedAt: p.updatedAt.getTime(),
  }
}

// ##################################
// 错误映射：主进程内部错误 → PlaylistErrorCode
// ##################################

function toPlaylistErrorCode(e: unknown): PlaylistErrorCode {
  if (e instanceof BilibiliApiError) return 'BILIBILI_REJECTED'
  if (e instanceof DatabaseError) return 'DATABASE'
  if (e instanceof FacadeError) {
    if (e.type === 'SyncTaskAlreadyRunning') return 'SYNC_TASK_RUNNING'
    return 'FACADE'
  }
  if (e instanceof ServiceError) {
    if (e.type === 'PlaylistNotFound' || e.type === 'TrackNotFound' || e.type === 'ArtistNotFound' || e.type === 'TrackNotInPlaylist') {
      return 'NOT_FOUND'
    }
    if (e.type === 'Validation') return 'VALIDATION'
    return 'SERVICE'
  }
  return 'UNKNOWN'
}

function toPlaylistErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

// ##################################
// Handler 注册
// ##################################

export function registerPlaylistIpc(mainWindow: BrowserWindow): void {
  const playlistService = getPlaylistService()

  // 获取所有 playlists
  ipcMain.handle(PLAYLIST_CHANNELS.getAll, async (): Promise<Result<Playlist[], PlaylistErrorCode>> => {
    const r = await playlistService.getAllPlaylists()
    if (r.isErr()) {
      return { ok: false, error: { code: 'DATABASE', message: r.error.message } }
    }
    return { ok: true, data: r.value.map(toIpcPlaylist) }
  })

  // 获取单个 playlist（带统计：validTrackCount / totalDuration）
  ipcMain.handle(
    PLAYLIST_CHANNELS.getById,
    async (_e, playlistId: number): Promise<Result<PlaylistWithMetadata | undefined, PlaylistErrorCode>> => {
      const r = await playlistService.getPlaylistMetadata(playlistId)
      if (r.isErr()) {
        return { ok: false, error: { code: 'DATABASE', message: r.error.message } }
      }
      if (!r.value) {
        return { ok: true, data: undefined }
      }
      const p = r.value
      return {
        ok: true,
        data: {
          ...toIpcPlaylist({
            id: p.id,
            title: p.title,
            author: p.author,
            description: p.description,
            coverUrl: p.coverUrl,
            itemCount: p.itemCount,
            type: p.type,
            remoteSyncId: p.remoteSyncId,
            lastSyncedAt: p.lastSyncedAt,
            isPinned: p.isPinned,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }),
          validTrackCount: p.validTrackCount,
          totalDuration: p.totalDuration,
        },
      }
    },
  )

  // 获取 playlist 中所有 tracks
  ipcMain.handle(
    PLAYLIST_CHANNELS.getTracks,
    async (_e, playlistId: number): Promise<Result<Track[], PlaylistErrorCode>> => {
      const r = await playlistService.getPlaylistTracks(playlistId)
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      return { ok: true, data: r.value.map(toIpcTrack) }
    },
  )

  // 分页获取 tracks
  ipcMain.handle(
    PLAYLIST_CHANNELS.getTracksPaginated,
    async (
      _e,
      options: GetTracksPaginatedOptions,
    ): Promise<Result<PlaylistTracksPaginated, PlaylistErrorCode>> => {
      // IPC 入参 cursor.createdAt 是 number，service 期望直接传（内部会转 Date）
      const r = await playlistService.getPlaylistTracksPaginated({
        playlistId: options.playlistId,
        initialLimit: options.initialLimit,
        limit: options.limit,
        cursor: options.cursor,
      })
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      return {
        ok: true,
        data: {
          tracks: r.value.tracks.map(toIpcTrack),
          sortKeys: r.value.sortKeys,
          nextCursor: r.value.nextCursor,
          nextPageFirstSortKey: r.value.nextPageFirstSortKey,
        },
      }
    },
  )

  // 创建本地歌单
  ipcMain.handle(
    PLAYLIST_CHANNELS.createLocal,
    async (
      _e,
      payload: CreateLocalPlaylistPayload,
    ): Promise<Result<Playlist, PlaylistErrorCode>> => {
      const r = await playlistService.createPlaylist({
        title: payload.title,
        description: payload.description,
        coverUrl: payload.coverUrl,
        type: 'local',
      })
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      // local playlist 没有 author，直接转换
      return {
        ok: true,
        data: toIpcPlaylist({
          ...r.value,
          author: null,
          lastSyncedAt: null,
          remoteSyncId: null,
        }),
      }
    },
  )

  // 更新歌单元数据（标题/描述/封面/置顶）
  ipcMain.handle(
    PLAYLIST_CHANNELS.updateMetadata,
    async (
      _e,
      args: [playlistId: number, payload: UpdatePlaylistPayload],
    ): Promise<Result<Playlist, PlaylistErrorCode>> => {
      const [playlistId, payload] = args
      const r = await playlistService.updatePlaylistMetadata(playlistId, payload)
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      return {
        ok: true,
        data: toIpcPlaylist({
          ...r.value,
          author: null,
          lastSyncedAt: null,
          remoteSyncId: null,
        }),
      }
    },
  )

  // 删除歌单（级联删除 playlistTracks）
  ipcMain.handle(
    PLAYLIST_CHANNELS.delete,
    async (
      _e,
      playlistId: number,
    ): Promise<Result<{ deletedId: number }, PlaylistErrorCode>> => {
      const r = await playlistService.deletePlaylist(playlistId)
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      return { ok: true, data: r.value }
    },
  )

  // 批量添加 tracks 到本地歌单
  ipcMain.handle(
    PLAYLIST_CHANNELS.addTracks,
    async (
      _e,
      args: [playlistId: number, trackIds: number[]],
    ): Promise<Result<number, PlaylistErrorCode>> => {
      const [playlistId, trackIds] = args
      const r = await playlistService.addManyTracksToLocalPlaylist(
        playlistId,
        trackIds,
      )
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      return { ok: true, data: r.value.length }
    },
  )

  // 批量移除 tracks
  ipcMain.handle(
    PLAYLIST_CHANNELS.removeTracks,
    async (
      _e,
      args: [playlistId: number, trackIds: number[]],
    ): Promise<Result<{ removedCount: number; missingIds: number[] }, PlaylistErrorCode>> => {
      const [playlistId, trackIds] = args
      const r = await playlistService.batchRemoveTracksFromLocalPlaylist(
        playlistId,
        trackIds,
      )
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      return {
        ok: true,
        data: {
          removedCount: r.value.removedTrackIds.length,
          missingIds: r.value.missingTrackIds,
        },
      }
    },
  )

  // 重排序单曲位置（fractional indexing）
  ipcMain.handle(
    PLAYLIST_CHANNELS.reorderTrack,
    async (
      _e,
      args: [playlistId: number, payload: ReorderTrackPayload],
    ): Promise<Result<true, PlaylistErrorCode>> => {
      const [playlistId, payload] = args
      const r = await playlistService.reorderSingleLocalPlaylistTrack(
        playlistId,
        payload,
      )
      if (r.isErr()) {
        return {
          ok: false,
          error: {
            code: r.error instanceof ServiceError ? 'SERVICE' : 'DATABASE',
            message: r.error.message,
          },
        }
      }
      return { ok: true, data: true }
    },
  )

  // 同步远端歌单（favorite / collection / multi_page）
  // 同步进度通过 PLAYLIST_CHANNELS.syncProgress 主动推送给渲染进程
  ipcMain.handle(
    PLAYLIST_CHANNELS.syncRemote,
    async (
      _e,
      args: [remoteSyncId: number, type: import('../../shared/ipc-types').PlaylistType],
    ): Promise<Result<number | undefined, PlaylistErrorCode>> => {
      const [remoteSyncId, type] = args
      if (type === 'local') {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: '本地歌单不支持同步',
          },
        }
      }

      // 进度回调：通过 webContents.send 推送给渲染进程
      const onProgress: SyncProgressCb = (progress) => {
        mainWindow.webContents.send(PLAYLIST_CHANNELS.syncProgress, progress)
      }

      const r = await syncBilibiliPlaylistFacade.instance
        .sync(remoteSyncId, type, onProgress)
        .match<
          | { ok: true; data: number | undefined }
          | { ok: false; error: { code: PlaylistErrorCode; message: string } }
        >(
          (data) => ({ ok: true, data }),
          (error) => ({
            ok: false,
            error: {
              code: toPlaylistErrorCode(error),
              message: toPlaylistErrorMessage(error),
            },
          }),
        )
      return r
    },
  )
}
