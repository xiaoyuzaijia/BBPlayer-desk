// 渲染进程曲目类型：直接 re-export 共享类型，避免双份维护
// 阶段 B 起对齐 src/shared/ipc-types.ts（id: number + union 类型）
export type {
  Artist,
  BilibiliTrack,
  BilibiliTrackMetadata,
  LocalTrack,
  LocalTrackMetadata,
  Track,
  TrackSource,
} from '../../shared/ipc-types'
