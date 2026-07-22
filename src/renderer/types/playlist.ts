import type { Track } from './track'

// 歌单类型：
// - local:    完全本地歌单（用户自创，可增删歌曲）
// - synced:   同步型本地歌单（从在线歌单同步而来，歌曲列表只读）
// - favorite: B 站收藏夹（远端只读，可同步到本地）
// - toview:   稍后再看（远端只读，全局唯一，无 id）
export type PlaylistType = 'local' | 'synced' | 'favorite' | 'toview'

export interface Playlist {
  id: string
  title: string
  description?: string
  coverUrl?: string
  type: PlaylistType
  isPinned?: boolean
  // 远端同步 ID（synced / favorite / toview 才有，本地歌单为空）
  remoteSyncId?: string
  createdAt: number
  updatedAt: number
  tracks: Track[]
}
