// bilibili 模块 IPC handler
// 暴露 B 站收藏夹浏览能力给渲染进程：列表 / 内容 / 按 bvid 入库单首 track
// 不直接碰 db，业务编排走 bilibiliApi 或 syncBilibiliPlaylistFacade
//
// 错误：BilibiliApiError / FacadeError 统一映射为 AuthErrorCode 或 PlaylistErrorCode
// 时间戳：B 站 API 已返回 number（ms 或 s），按各方法原样透传
import { ipcMain } from 'electron'

import { BILIBILI_CHANNELS } from '../../shared/ipc-channels'
import type {
  AuthErrorCode,
  BilibiliFavoriteFolder,
  BilibiliFavoriteListContents,
  PlaylistErrorCode,
  Result,
  Track,
} from '../../shared/ipc-types'
import { BilibiliApiError } from '../lib/errors/bilibili'
import { FacadeError } from '../lib/errors'
import { syncBilibiliPlaylistFacade } from '../lib/facades/syncBilibiliPlaylist'
import { appState } from '../lib/config/store'
import { bilibiliApi } from '../lib/api/clients/bilibili/api'
import type {
  Artist as ServiceArtist,
  Track as ServiceTrack,
} from '../lib/services/types'

// ##################################
// 主进程内部类型 → IPC 共享类型 转换器
// 与 ipc/playlist.ts 中同名函数保持一致（addTrackByBvid 入库后转 IPC Track）
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

// ##################################
// 错误映射
// ##################################

function mapBilibiliError(e: unknown): { code: AuthErrorCode; message: string } {
  if (e instanceof BilibiliApiError) {
    return { code: 'BILIBILI_REJECTED', message: e.message }
  }
  return {
    code: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }
}

function mapPlaylistError(e: unknown): { code: PlaylistErrorCode; message: string } {
  if (e instanceof BilibiliApiError) return { code: 'BILIBILI_REJECTED', message: e.message }
  if (e instanceof FacadeError) return { code: 'FACADE', message: e.message }
  return { code: 'UNKNOWN', message: e instanceof Error ? e.message : String(e) }
}

// ##################################
// Handler 注册
// ##################################

export function registerBilibiliIpc(): void {
  // 1. 获取本人所有收藏夹
  ipcMain.handle(
    BILIBILI_CHANNELS.getFavoritePlaylists,
    async (): Promise<Result<BilibiliFavoriteFolder[], AuthErrorCode>> => {
      const mid = Number(appState.bilibiliCookie?.DedeUserID)
      if (!mid) {
        return {
          ok: false,
          error: {
            code: 'NOT_LOGGED_IN',
            message: '未登录或 cookie 缺少 DedeUserID',
          },
        }
      }
      const r = await bilibiliApi.getFavoritePlaylists({ userMid: mid })
      return r.match(
        (data) => ({ ok: true, data }),
        (e) => ({ ok: false, error: mapBilibiliError(e) }),
      )
    },
  )

  // 2. 获取收藏夹内容（分页）
  //    ipcRenderer.invoke 会把 favoriteId / pn 作为独立参数传过来
  //    （不是数组），handler 签名按独立参数接收
  ipcMain.handle(
    BILIBILI_CHANNELS.getFavoriteListContents,
    async (
      _e,
      favoriteId: number,
      pn: number,
    ): Promise<Result<BilibiliFavoriteListContents, AuthErrorCode>> => {
      const r = await bilibiliApi.getFavoriteListContents({ favoriteId, pn })
      return r.match(
        (data) => ({ ok: true, data }),
        (e) => ({ ok: false, error: mapBilibiliError(e) }),
      )
    },
  )

  // 3. 按 bvid 入库单首 track（远端点击播放用）
  //    走 facade.addTrackFromBilibiliApi：拉视频详情 → findOrCreate artist/track
  ipcMain.handle(
    BILIBILI_CHANNELS.addTrackByBvid,
    async (
      _e,
      bvid: string,
      cid?: number,
    ): Promise<Result<Track, PlaylistErrorCode>> => {
      const r = await syncBilibiliPlaylistFacade.instance
        .addTrackFromBilibiliApi(bvid, cid)
        .match<
          | { ok: true; data: Track }
          | { ok: false; error: { code: PlaylistErrorCode; message: string } }
        >(
          (track) => ({ ok: true, data: toIpcTrack(track) }),
          (e) => ({ ok: false, error: mapPlaylistError(e) }),
        )
      return r
    },
  )
}
