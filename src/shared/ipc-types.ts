// IPC 请求/响应类型 + 共享业务类型（三端共享：主进程/preload/渲染进程）

/**
 * auth 模块错误码（IPC 边界用，主进程内部 BilibiliApiError 不跨 IPC）
 */
export type AuthErrorCode =
  | 'NETWORK'
  | 'BILIBILI_REJECTED'
  | 'QR_EXPIRED'
  | 'NOT_LOGGED_IN'
  | 'UNKNOWN'

/**
 * playlist 模块错误码
 */
export type PlaylistErrorCode =
  | 'DATABASE'
  | 'SERVICE'
  | 'FACADE'
  | 'BILIBILI_REJECTED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'SYNC_TASK_RUNNING'
  | 'UNKNOWN'

/**
 * Result 包装类型：主进程 IPC handler 返回值统一用此类型
 * 替代 throw，错误信息结构化
 */
export type Result<T, E = AuthErrorCode> =
  | { ok: true; data: T }
  | { ok: false; error: { code: E; message: string } }

/**
 * B 站用户信息（getUserInfo IPC 返回）
 */
export interface BilibiliUserInfo {
  mid: number
  name: string
  face: string
  sign: string
}

/**
 * 主进程推送的登录态快照（auth:stateChanged）
 */
export interface AuthStateSnapshot {
  isLoggedIn: boolean
  userInfo: {
    mid?: number
    name?: string
    face?: string
    cachedAt?: number
  } | null
}

/**
 * 扫码状态机（auth:qrStatus 推送）
 * 注意：qrcodeKey 不暴露给渲染进程（敏感字段）
 */
export type QrStatus =
  | { state: 'generating' }
  | { state: 'polling'; url: string }
  | { state: 'scanned' }
  | { state: 'success' }
  | { state: 'expired' }
  | { state: 'error'; message: string }

// ##################################
// Playlist / Track / Artist 共享类型
// 时间戳统一用 number（ms epoch），便于 IPC 序列化
// 与主进程 services/types.ts 中的类型对齐，仅 Date → number 差异
// ##################################

export type PlaylistType = 'favorite' | 'collection' | 'multi_page' | 'local'
export type TrackSource = 'bilibili' | 'local'

export interface Artist {
  id: number
  name: string
  avatarUrl: string | null
  signature: string | null
  source: TrackSource
  remoteId: string | null
  createdAt: number // ms epoch
  updatedAt: number // ms epoch
}

export interface BilibiliTrackMetadata {
  bvid: string
  cid: number | null
  isMultiPage: boolean
  videoIsValid: boolean
  mainTrackTitle: string | null
}

export interface LocalTrackMetadata {
  localPath: string
}

interface BaseTrack {
  id: number
  uniqueKey: string
  title: string
  artist: Artist | null
  coverUrl: string | null
  source: TrackSource
  duration: number
  createdAt: number // ms epoch
  updatedAt: number // ms epoch
}

export interface BilibiliTrack extends BaseTrack {
  source: 'bilibili'
  bilibiliMetadata: BilibiliTrackMetadata
}

export interface LocalTrack extends BaseTrack {
  source: 'local'
  localMetadata: LocalTrackMetadata
}

export type Track = BilibiliTrack | LocalTrack

export interface Playlist {
  id: number
  title: string
  author: Artist | null
  description: string | null
  coverUrl: string | null
  itemCount: number
  type: PlaylistType
  remoteSyncId: number | null
  lastSyncedAt: number | null // ms epoch
  isPinned: boolean
  createdAt: number // ms epoch
  updatedAt: number // ms epoch
}

export interface PlaylistWithMetadata extends Playlist {
  validTrackCount: number
  totalDuration: number
}

export interface PlaylistTracksPaginated {
  tracks: Track[]
  sortKeys: string[]
  nextCursor?: {
    lastSortKey: string
    createdAt: number
    lastId: number
  }
  nextPageFirstSortKey?: string
}

// Playlist 操作的请求 payload 类型
export interface CreateLocalPlaylistPayload {
  title: string
  description?: string | null
  coverUrl?: string | null
}

export interface UpdatePlaylistPayload {
  title?: string | null
  description?: string | null
  coverUrl?: string | null
  isPinned?: boolean | null
}

export interface ReorderTrackPayload {
  trackId: number
  prevSortKey: string | null // 目标位置前一项的 sortKey，null 代表列表最前
  nextSortKey: string | null // 目标位置后一项的 sortKey，null 代表列表最后
}

export interface GetTracksPaginatedOptions {
  playlistId: number
  initialLimit?: number
  limit: number
  cursor:
    | { lastSortKey: string; createdAt: number; lastId: number }
    | undefined
}

/**
 * 同步进度推送（playlist:syncProgress）
 * 与 main/lib/facades/syncBilibiliPlaylist.ts 中 FavoriteSyncProgress 对齐
 */
export interface FavoriteSyncProgress {
  message: string
  current?: number
  total?: number
  stage:
    | 'initializing'
    | 'fetching_metadata'
    | 'calculating_diff'
    | 'fetching_details'
    | 'saving'
    | 'completed'
    | 'error'
  /** 标识本次同步任务（type + remoteSyncId），渲染进程用来匹配正在同步的歌单 */
  taskId: string
}
