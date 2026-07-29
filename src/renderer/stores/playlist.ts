// playlist store（阶段 C 重构后）
//
// 阶段 B 时曾用此 store 缓存假数据 + 提供 getTracks / getPlaylistsByType 等方法。
// 阶段 C 已把数据获取迁移到 TanStack Query（usePlaylists / usePlaylistTracks），
// 歌单列表 / 曲目列表都不再放 store（AGENTS.md：业务数据走 Query，store 只放 UI 状态）。
//
// 当前职责：仅保留 totalDuration 工具函数（PlaylistHeader 算总时长用）。
// 后续若需要"当前浏览的歌单 id"等 UI 状态，可在此扩展。
import type { Track } from '../types/track'

// 计算曲目列表总时长（秒）
// 独立导出：纯函数，不依赖 store 实例，PlaylistHeader 直接 import 用
export function totalDuration(tracks: Track[]): number {
  return tracks.reduce((sum, t) => sum + t.duration, 0)
}
