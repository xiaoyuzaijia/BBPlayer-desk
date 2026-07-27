// preload：通过 contextBridge 安全暴露主进程 API 给渲染进程
// 渲染进程通过 window.api.xxx() 调用，禁止直接用 ipcRenderer
import { contextBridge, ipcRenderer } from 'electron'

import {
  AUTH_CHANNELS,
  IMAGE_CHANNELS,
  PLAYLIST_CHANNELS,
} from '../shared/ipc-channels'
import type {
  AuthStateSnapshot,
  BilibiliUserInfo,
  CreateLocalPlaylistPayload,
  FavoriteSyncProgress,
  GetTracksPaginatedOptions,
  Playlist,
  PlaylistErrorCode,
  PlaylistTracksPaginated,
  PlaylistType,
  PlaylistWithMetadata,
  QrStatus,
  ReorderTrackPayload,
  Result,
  Track,
  UpdatePlaylistPayload,
} from '../shared/ipc-types'

const api = {
  auth: {
    loginWithQrCode: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.loginWithQrCode) as Promise<Result<null>>,
    cancelQrLogin: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.cancelQrLogin) as Promise<Result<null>>,
    logout: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.logout) as Promise<Result<null>>,
    getUserInfo: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.getUserInfo) as Promise<
        Result<BilibiliUserInfo>
      >,
    /**
     * 订阅扫码状态推送，返回 unsubscribe 函数
     * 组件 onUnmounted 调用避免内存泄漏
     */
    onQrStatus: (cb: (status: QrStatus) => void): (() => void) => {
      const handler = (_e: unknown, status: QrStatus): void => cb(status)
      ipcRenderer.on(AUTH_CHANNELS.qrStatus, handler)
      return () => ipcRenderer.off(AUTH_CHANNELS.qrStatus, handler)
    },
    /**
     * 订阅登录态变化推送，返回 unsubscribe 函数
     */
    onStateChanged: (cb: (snapshot: AuthStateSnapshot) => void): (() => void) => {
      const handler = (_e: unknown, snapshot: AuthStateSnapshot): void =>
        cb(snapshot)
      ipcRenderer.on(AUTH_CHANNELS.stateChanged, handler)
      return () => ipcRenderer.off(AUTH_CHANNELS.stateChanged, handler)
    },
  },
  image: {
    /**
     * 获取本地图片代理 server 端口
     * 渲染进程用 http://127.0.0.1:<port>/image?url=<encoded> 访问 B 站 CDN 图片
     */
    getProxyPort: () =>
      ipcRenderer.invoke(IMAGE_CHANNELS.getProxyPort) as Promise<number>,
  },
  playlist: {
    /**
     * 获取所有 playlists（按 isPinned > updatedAt DESC 排序）
     */
    getAll: () =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.getAll) as Promise<
        Result<Playlist[], PlaylistErrorCode>
      >,
    /**
     * 获取单个 playlist 元数据 + 统计（validTrackCount / totalDuration）
     * 不存在时返回 undefined
     */
    getById: (id: number) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.getById, id) as Promise<
        Result<PlaylistWithMetadata | undefined, PlaylistErrorCode>
      >,
    /**
     * 获取 playlist 中所有 tracks（按 sortKey DESC）
     */
    getTracks: (id: number) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.getTracks, id) as Promise<
        Result<Track[], PlaylistErrorCode>
      >,
    /**
     * 分页获取 tracks（游标分页）
     */
    getTracksPaginated: (options: GetTracksPaginatedOptions) =>
      ipcRenderer.invoke(
        PLAYLIST_CHANNELS.getTracksPaginated,
        options,
      ) as Promise<Result<PlaylistTracksPaginated, PlaylistErrorCode>>,
    /**
     * 创建本地歌单（type='local'）
     */
    createLocal: (payload: CreateLocalPlaylistPayload) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.createLocal, payload) as Promise<
        Result<Playlist, PlaylistErrorCode>
      >,
    /**
     * 更新歌单元数据（标题/描述/封面/置顶）
     */
    updateMetadata: (id: number, payload: UpdatePlaylistPayload) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.updateMetadata, id, payload) as Promise<
        Result<Playlist, PlaylistErrorCode>
      >,
    /**
     * 删除歌单（级联删除 playlistTracks）
     */
    delete: (id: number) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.delete, id) as Promise<
        Result<{ deletedId: number }, PlaylistErrorCode>
      >,
    /**
     * 批量添加 tracks 到本地歌单（仅 type='local'）
     * 返回实际添加的数量（冲突忽略）
     */
    addTracks: (id: number, trackIds: number[]) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.addTracks, id, trackIds) as Promise<
        Result<number, PlaylistErrorCode>
      >,
    /**
     * 批量移除 tracks（仅 type='local'）
     * 返回 { removedCount, missingIds }
     */
    removeTracks: (id: number, trackIds: number[]) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.removeTracks, id, trackIds) as Promise<
        Result<
          { removedCount: number; missingIds: number[] },
          PlaylistErrorCode
        >
      >,
    /**
     * 重排序单曲位置（fractional indexing）
     * prevSortKey: 目标位置前一项的 sortKey，null 代表列表最前
     * nextSortKey: 目标位置后一项的 sortKey，null 代表列表最后
     */
    reorderTrack: (id: number, payload: ReorderTrackPayload) =>
      ipcRenderer.invoke(PLAYLIST_CHANNELS.reorderTrack, id, payload) as Promise<
        Result<true, PlaylistErrorCode>
      >,
    /**
     * 同步远端歌单（favorite / collection / multi_page）
     * 进度通过 onSyncProgress 推送，成功后返回 playlistId
     */
    syncRemote: (remoteSyncId: number, type: PlaylistType) =>
      ipcRenderer.invoke(
        PLAYLIST_CHANNELS.syncRemote,
        remoteSyncId,
        type,
      ) as Promise<Result<number | undefined, PlaylistErrorCode>>,
    /**
     * 订阅同步进度推送，返回 unsubscribe 函数
     * 组件 onUnmounted 调用避免内存泄漏
     */
    onSyncProgress: (
      cb: (progress: FavoriteSyncProgress) => void,
    ): (() => void) => {
      const handler = (_e: unknown, progress: FavoriteSyncProgress): void =>
        cb(progress)
      ipcRenderer.on(PLAYLIST_CHANNELS.syncProgress, handler)
      return () => ipcRenderer.off(PLAYLIST_CHANNELS.syncProgress, handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
