// Service 层 payload 类型与共享业务模型
// 复刻 BBPlayer apps/mobile/src/types/services/{track,artist,playlist}.ts
// 以及 apps/mobile/src/types/core/media.ts 中 service 层需要用到的部分
// 注意：与 shared/ipc-types.ts 的 IPC 类型相互独立（service 层用 Date，IPC 边界统一转 number）

// ##################################
// Artist
// ##################################
export interface CreateArtistPayload {
  name: string
  source: 'bilibili' | 'local'
  remoteId?: string | null
  avatarUrl?: string | null
  signature?: string | null
}

export interface UpdateArtistPayload {
  name?: string | null
  avatarUrl?: string | null
  signature?: string | null
}

// ##################################
// Track metadata payloads
// ##################################
export interface BilibiliMetadataPayload {
  bvid: string
  isMultiPage: boolean
  cid?: number | null
  videoIsValid: boolean
  mainTrackTitle?: string | null // 分 P 视频的主标题
}

export interface LocalMetadataPayload {
  localPath: string
}

// ##################################
// Track payload
// ##################################
export interface CreateTrackPayloadBase {
  title: string
  artistId?: number | null
  coverUrl?: string | null
  duration: number
}

export interface CreateBilibiliTrackPayload extends CreateTrackPayloadBase {
  source: 'bilibili'
  bilibiliMetadata: BilibiliMetadataPayload
}

export interface CreateLocalTrackPayload extends CreateTrackPayloadBase {
  source: 'local'
  localMetadata: LocalMetadataPayload
}

export type CreateTrackPayload =
  | CreateBilibiliTrackPayload
  | CreateLocalTrackPayload

export interface UpdateTrackPayloadBase {
  id: number
  title?: string | null
  coverUrl?: string | null
  duration?: number | null
  artistId?: number | null
}

export interface UpdateBilibiliTrackPayload extends UpdateTrackPayloadBase {
  source: 'bilibili'
  bilibiliMetadata?: Partial<BilibiliMetadataPayload>
}

export interface UpdateLocalTrackPayload extends UpdateTrackPayloadBase {
  source: 'local'
  localMetadata?: Partial<LocalMetadataPayload>
}

export type UpdateTrackPayload =
  | UpdateBilibiliTrackPayload
  | UpdateLocalTrackPayload

// 用于 generateUniqueTrackKey 的 source data
export type TrackSourceData =
  | { source: 'bilibili'; bilibiliMetadata: BilibiliMetadataPayload }
  | { source: 'local'; localMetadata: LocalMetadataPayload }

// ##################################
// Playlist payload
// ##################################
export type PlaylistType = 'favorite' | 'collection' | 'multi_page' | 'local'

export interface CreatePlaylistPayload {
  title: string
  description?: string | null
  coverUrl?: string | null
  authorId?: number | null // 本地播放列表为 null
  type: PlaylistType
  remoteSyncId?: number | null
}

export interface UpdatePlaylistPayload {
  title?: string | null
  description?: string | null
  coverUrl?: string | null
  isPinned?: boolean | null
}

export interface ReorderLocalPlaylistTrackPayload {
  trackId: number
  prevSortKey: string | null // 目标位置前一项的 sortKey，null 代表列表最前
  nextSortKey: string | null // 目标位置后一项的 sortKey，null 代表列表最后
}

// ##################################
// Play record
// ##################################
export interface PlayRecord {
  startTime: number // 播放开始的时间戳 (ms)
  durationPlayed: number // 实际播放的秒数
  completed: boolean // 是否完整播放
}

// ##################################
// 共享业务模型（service 返回值）
// 与 BBPlayer apps/mobile/src/types/core/media.ts 对应
// ##################################
export interface Artist {
  id: number
  name: string
  avatarUrl: string | null
  signature: string | null
  source: 'bilibili' | 'local'
  remoteId: string | null
  createdAt: Date
  updatedAt: Date
}

interface BaseTrack {
  id: number
  uniqueKey: string
  title: string
  artist: Artist | null
  coverUrl: string | null
  source: 'bilibili' | 'local'
  createdAt: Date
  duration: number // 秒
  updatedAt: Date
}

export interface BilibiliTrack extends BaseTrack {
  source: 'bilibili'
  bilibiliMetadata: {
    bvid: string
    cid: number | null
    isMultiPage: boolean
    videoIsValid: boolean
    mainTrackTitle: string | null
    audioStreamUrl: string | null
    streamExpiresAt: Date | null
  }
}

export interface LocalTrack extends BaseTrack {
  source: 'local'
  localMetadata: {
    localPath: string
  }
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
  lastSyncedAt: Date | null
  isPinned: boolean
  createdAt: Date
  updatedAt: Date
}
