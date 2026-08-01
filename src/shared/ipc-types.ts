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
 * playback 模块错误码
 */
export type PlaybackErrorCode =
  | 'DATABASE'
  | 'SERVICE'
  | 'FACADE'
  | 'BILIBILI_REJECTED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'UNKNOWN'

/**
 * history 模块错误码
 */
export type HistoryErrorCode = 'DATABASE' | 'SERVICE' | 'UNKNOWN'

/**
 * lyric 模块错误码
 */
export type LyricErrorCode =
  | 'NETWORK'
  | 'THIRD_PARTY'
  | 'NOT_FOUND'
  | 'SERVICE'
  | 'FACADE'
  | 'BILIBILI_REJECTED'
  | 'UNKNOWN'

/**
 * 歌词源（用户偏好，auto 表示多源竞速）
 * 不含 netease（Q1 决策不做网易云）
 */
export type LyricSource = 'auto' | 'qqmusic' | 'kugou'

/**
 * 歌词文件数据（跨 IPC 传输）
 * 与主进程 LyricFileData 字段一致，但 id 用 track.uniqueKey
 * lrc / tlyric / romalrc 是 SPL 格式字符串，渲染进程调 parseAndMergeLyrics 解析
 */
export interface LyricFileData {
  /** 曲目唯一 ID（track.uniqueKey） */
  id: string
  /** 缓存写入时间（ms epoch） */
  updateTime: number
  /** 主歌词（SPL 格式字符串） */
  lrc?: string
  /** 翻译歌词（QQ 音乐可能返回，酷狗恒为 undefined） */
  tlyric?: string
  /** 罗马音歌词（QQ/酷狗均不返回，保留字段与 BBPlayer 对齐） */
  romalrc?: string
  /** 获取失败时的展示文本（多源全失败时落盘，避免反复重试） */
  errorMessage?: string
}

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

/**
 * 播放记录 payload（history:record）
 * <audio> ended 事件触发时由 useAudioEngine 调用，写 play_history 表
 * - trackId: 曲目 id
 * - startTime: 播放开始时间戳 (ms epoch)
 * - durationPlayed: 实际播放秒数（可能小于 track.duration，用户可能跳过）
 * - completed: 是否播放完成（默认 currentTime >= duration - 5s 视为完成）
 */
export interface PlayRecordPayload {
  trackId: number
  startTime: number
  durationPlayed: number
  completed: boolean
}

// ##################################
// B 站收藏夹浏览（未同步也可浏览）
// 用于 bilibili:* IPC 通道，与主进程内部类型独立
// ##################################

/**
 * B 站收藏夹列表项（getFavoritePlaylists 返回）
 */
export interface BilibiliFavoriteFolder {
  id: number // 收藏夹 fid
  title: string
  cover: string | null
  upper: { mid: number; name: string; face: string | null }
  media_count: number // 曲目数
  fav_time: number // 创建时间（B 站 API 秒级时间戳，原样透传）
  intro: string | null
}

/**
 * B 站收藏夹内容单项（getFavoriteListContents.medias[i]）
 */
export interface BilibiliFavoriteMedia {
  bvid: string
  title: string
  cover: string | null
  upper: { mid: number; name: string; face: string | null }
  duration: number // 秒
  fav_time: number
  attr: number // 0 = 正常，其他 = 失效
  cid: number | null
}

/**
 * B 站收藏夹内容响应（getFavoriteListContents 返回）
 */
export interface BilibiliFavoriteListContents {
  info: {
    id: number
    title: string
    cover: string | null
    upper: { mid: number; name: string; face: string | null }
    intro: string | null
    media_count: number // 收藏夹内媒体总数（B 站 API 字段）
  } | null
  medias: BilibiliFavoriteMedia[] | null
  has_more: boolean
}
