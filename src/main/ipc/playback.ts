// playback 模块 IPC handler
// 把 PlaybackFacade 暴露给渲染进程
// 错误映射：PlaybackFacadeError → PlaybackErrorCode
//
// 会话持久化：
// - saveSession：退出前渲染进程回传快照 → 写盘后销毁窗口继续退出流程
// - restoreSession：启动时渲染进程查询，主进程查 DB 组装完整 Track 返回
import { app, BrowserWindow, ipcMain } from 'electron'

import { PLAYBACK_CHANNELS } from '../../shared/ipc-channels'
import type {
  Artist,
  PlaybackErrorCode,
  PlaybackSessionSnapshot,
  RestoredPlaybackSession,
  Result,
  Track,
} from '../../shared/ipc-types'
import { BilibiliApiError } from '../lib/errors/bilibili'
import { DatabaseError, FacadeError, ServiceError } from '../lib/errors'
import { getPlaybackFacade } from '../lib/facades/playback'
import type { PlaybackFacadeError } from '../lib/facades/playback'
import type { Track as ServiceTrack } from '../lib/services/types'

// ##################################
// 主进程内部类型 → IPC 共享类型 转换器（Date → number，模式同 ipc/playlist.ts）
// ##################################

function toIpcArtist(a: ServiceTrack['artist']): Artist | null {
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

/**
 * 把 PlaybackFacadeError 映射为 PlaybackErrorCode
 */
function toPlaybackErrorCode(e: PlaybackFacadeError): PlaybackErrorCode {
  if (e instanceof BilibiliApiError) return 'BILIBILI_REJECTED'
  if (e instanceof DatabaseError) return 'DATABASE'
  if (e instanceof FacadeError) {
    // 视频失效复用了 FetchRemotePlaylistMetadataFailed 类型
    return 'FACADE'
  }
  if (e instanceof ServiceError) {
    if (e.type === 'TrackNotFound') return 'NOT_FOUND'
    if (e.type === 'Validation') return 'VALIDATION'
    return 'SERVICE'
  }
  return 'UNKNOWN'
}

function toPlaybackErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function registerPlaybackIpc(): void {
  ipcMain.handle(
    PLAYBACK_CHANNELS.getAudioUrl,
    async (_e, trackId: number): Promise<Result<string, PlaybackErrorCode>> => {
      const facade = getPlaybackFacade()
      const r = await facade.getAudioUrl(trackId)
      return r.match<
        | { ok: true; data: string }
        | { ok: false; error: { code: PlaybackErrorCode; message: string } }
      >(
        (url) => ({ ok: true, data: url }),
        (error) => ({
          ok: false,
          error: {
            code: toPlaybackErrorCode(error),
            message: toPlaybackErrorMessage(error),
          },
        }),
      )
    },
  )

  ipcMain.handle(
    PLAYBACK_CHANNELS.refreshAudioUrl,
    async (
      _e,
      trackId: number,
    ): Promise<Result<string, PlaybackErrorCode>> => {
      const facade = getPlaybackFacade()
      const r = await facade.refreshAudioUrlByTrackId(trackId)
      return r.match<
        | { ok: true; data: string }
        | { ok: false; error: { code: PlaybackErrorCode; message: string } }
      >(
        (url) => ({ ok: true, data: url }),
        (error) => ({
          ok: false,
          error: {
            code: toPlaybackErrorCode(error),
            message: toPlaybackErrorMessage(error),
          },
        }),
      )
    },
  )

  // 退出前保存播放会话快照（渲染进程收到 saveSessionRequest 推送后回传）
  // 保存完成（无论成败，失败已 log）后销毁窗口并继续退出流程：
  // - destroy 跳过 close 事件，避免再次触发主进程 index.ts 里的保存拦截
  // - app.quit() 保证 macOS Cmd+Q 场景（quit 因 close 拦截被 abort 后）能完成退出
  ipcMain.handle(
    PLAYBACK_CHANNELS.saveSession,
    async (
      e,
      snapshot: PlaybackSessionSnapshot,
    ): Promise<Result<true, PlaybackErrorCode>> => {
      const facade = getPlaybackFacade()
      const r = await facade.saveSession(snapshot)
      BrowserWindow.fromWebContents(e.sender)?.destroy()
      app.quit()
      return r.match<
        | { ok: true; data: true }
        | { ok: false; error: { code: PlaybackErrorCode; message: string } }
      >(
        () => ({ ok: true, data: true }),
        (error) => ({
          ok: false,
          error: {
            code: toPlaybackErrorCode(error),
            message: toPlaybackErrorMessage(error),
          },
        }),
      )
    },
  )

  // 启动时恢复播放会话：主进程读快照 + 查 DB 组装完整 Track（Date → number）
  // 无快照 / 空队列 / 全部失效时 data 为 null
  ipcMain.handle(
    PLAYBACK_CHANNELS.restoreSession,
    async (): Promise<
      Result<RestoredPlaybackSession | null, PlaybackErrorCode>
    > => {
      const facade = getPlaybackFacade()
      const r = await facade.restoreSession()
      return r.match<
        | { ok: true; data: RestoredPlaybackSession | null }
        | { ok: false; error: { code: PlaybackErrorCode; message: string } }
      >(
        (session) => ({
          ok: true,
          data: session
            ? {
                tracks: session.tracks.map(toIpcTrack),
                currentIndex: session.currentIndex,
                position: session.position,
                playMode: session.playMode,
                volume: session.volume,
              }
            : null,
        }),
        (error) => ({
          ok: false,
          error: {
            code: toPlaybackErrorCode(error),
            message: toPlaybackErrorMessage(error),
          },
        }),
      )
    },
  )
}
