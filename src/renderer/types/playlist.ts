// 渲染进程歌单类型：直接 re-export 共享类型，避免双份维护
// 阶段 B 起对齐 src/shared/ipc-types.ts
// 注意：共享 Playlist 不含 tracks 字段，曲目列表单独通过 TanStack Query 获取
export type {
  FavoriteSyncProgress,
  Playlist,
  PlaylistType,
  PlaylistTracksPaginated,
  PlaylistWithMetadata,
} from '../../shared/ipc-types'
