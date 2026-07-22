import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Playlist, PlaylistType } from '../types/playlist'
import type { Track } from '../types/track'
import { fakePlaylists } from '../data/playlists'

// ── playlist store（歌单查询入口）──
// 参考 BBPlayer：业务数据由 data 层（未来是 API / IndexedDB）提供
// store 只做查询入口 + 简单工具方法
// 不放 action：未来增删改走 mutation 钩子 + queryClient.invalidateQueries
export const usePlaylistStore = defineStore('playlist', () => {
  // 数据源（未来换成 reactive DB 缓存）
  const playlists = ref<Playlist[]>(fakePlaylists)

  // 按 id 查找歌单（包含 toview 全局唯一）
  function getPlaylistById(id: string): Playlist | undefined {
    return playlists.value.find((p) => p.id === id)
  }

  // 取稍后再看（快捷方式）
  function getToViewPlaylist(): Playlist | undefined {
    return getPlaylistById('toview')
  }

  // 按 type 取歌单列表（用于 LibraryView 各 tab）
  function getPlaylistsByType(type: PlaylistType): Playlist[] {
    return playlists.value.filter((p) => p.type === type)
  }

  return {
    playlists,
    getPlaylistById,
    getToViewPlaylist,
    getPlaylistsByType,
  }
})

// ── 工具函数（非 store 方法，独立导出）──
// 计算曲目列表总时长（秒）
export function totalDuration(tracks: Track[]): number {
  return tracks.reduce((sum, t) => sum + t.duration, 0)
}
