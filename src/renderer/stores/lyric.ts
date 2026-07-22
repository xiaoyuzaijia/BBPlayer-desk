import { computed } from 'vue'
import { defineStore } from 'pinia'
import type { LyricFile, LyricLine } from '../types/lyric'
import { getLyricByTrackId } from '../data/lyrics'
import { usePlayerStore } from './player'
import { usePlaybackStore } from './playback'

// ── lyric store（歌词查询 + 当前行派生）──
// 参考 BBPlayer：store 极简化，只做"查询入口 + 派生"，不放 action
// 真源在 data/lyrics.ts；本 store 订阅 player.currentTrack（切歌时换歌词）
// + playback.currentTime（更新当前行索引）
export const useLyricStore = defineStore('lyric', () => {
  const player = usePlayerStore()
  const playback = usePlaybackStore()

  // 当前曲目的歌词文件（随 currentTrack 变化重新查询）
  const lyricFile = computed<LyricFile | null>(() => {
    const trackId = player.currentTrack?.id
    if (!trackId) return null
    return getLyricByTrackId(trackId)
  })

  // 歌词行数组（便于组件 v-for）
  const lines = computed<LyricLine[]>(() => lyricFile.value?.lines ?? [])

  // 是否有翻译（UI 决策用：决定是否渲染翻译行）
  const hasTranslation = computed(() => lyricFile.value?.hasTranslation ?? false)

  // 当前行索引：二分查找 time <= currentTime 的最后一条
  // 无歌词或 currentTime 早于第一行 → 返回 -1（让 UI 不高亮任何行）
  const currentLyricIndex = computed(() => {
    const arr = lines.value
    if (arr.length === 0) return -1
    const t = playback.currentTime
    if (t < arr[0].time) return -1
    // 二分查找：找到最大的 i 使 arr[i].time <= t
    let lo = 0
    let hi = arr.length - 1
    let ans = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid].time <= t) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return ans
  })

  return { lyricFile, lines, hasTranslation, currentLyricIndex }
})
