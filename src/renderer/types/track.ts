// 渲染进程曲目类型：直接 re-export 共享类型，避免双份维护
// 直接复用 src/shared/ipc-types.ts 的类型（id: number + union）
export type {
  Artist,
  BilibiliTrack,
  BilibiliTrackMetadata,
  LocalTrack,
  LocalTrackMetadata,
  Track,
  TrackSource,
} from '../../shared/ipc-types'
