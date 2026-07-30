import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { defineStore } from 'pinia'

import { useLyricsQuery } from '../composables/queries/lyric/lyric'
import { parseAndMergeLyrics } from '../utils/splash/src'
import type { LyricFileData, LyricLine } from '../types/lyric'
import { usePlayerStore } from './player'
import { usePlaybackStore } from './playback'

// ── lyric store（歌词查询 + 解析 + 当前行派生）──
// 参考 BBPlayer：store 极简化，只做"查询入口 + 解析 + 派生"，不放 action
// 真源在主进程 LyricFacade（缓存 + 网络竞速）；本 store 订阅 player.currentTrack（切歌时换歌词）
// + playback.smoothCurrentTime（rAF 60fps 平滑进度，更新当前行索引）
//
// 与 BBPlayer 的差异：
// - BBPlayer 用 Zustand + 主动 fetch；本项目用 TanStack Query 自动管理缓存/重试
// - BBPlayer 在 service 层解析；本项目在渲染进程调 splash.parseAndMergeLyrics 解析
//   （Q14 决策：渲染进程解析，因为 splash 是纯函数，且手动编辑 verify 需在渲染进程）
// - BBPlayer 用 Reanimated SharedValue 做 60fps 插值；本项目用 Vue ref + rAF
//   （Q18 决策：渲染进程 requestAnimationFrame 平滑插值）
//
// 注意：splash.LyricLine.startTime 是毫秒，smoothCurrentTime 是秒 → 二分查找需 * 1000
export const useLyricStore = defineStore('lyric', () => {
  const player = usePlayerStore()
  const playback = usePlaybackStore()

  // 当前曲目的歌词文件（随 currentTrack 变化重新查询）
  // useLyricsQuery 内部用 computed queryKey，trackId 变化时自动重新查询
  const { currentTrackId } = storeToRefs(player)
  // 平滑进度（来自 playback store 的 60fps rAF 插值，全局单一 rAF 循环）
  // 不用 currentTime（4Hz timeupdate，250ms 延迟），保证歌词行高亮及时切换
  const { smoothCurrentTime } = storeToRefs(playback)
  const lyricsQuery = useLyricsQuery(currentTrackId)

  // 歌词文件数据（IPC 返回的原始结构，含 lrc/tlyric/romalrc 字符串）
  const lyricFile = computed<LyricFileData | null>(
    () => lyricsQuery.data.value ?? null,
  )

  // 解析后的歌词行数组（splash.parseAndMergeLyrics 合并主歌词+翻译+罗马音）
  // 解析失败（如 lrc 格式错误）返回空数组，UI 显示"歌词解析失败"
  const lines = computed<LyricLine[]>(() => {
    const file = lyricFile.value
    if (!file?.lrc) return []
    try {
      return parseAndMergeLyrics({
        lrc: file.lrc,
        tlyric: file.tlyric,
        romalrc: file.romalrc,
      })
    } catch {
      return []
    }
  })

  // 是否有翻译（UI 决策用：决定是否渲染翻译行）
  // 只要有任意一行 translation 非空就算有翻译
  const hasTranslation = computed(() =>
    lines.value.some((l) => !!l.translation),
  )

  // 当前行索引：二分查找 startTime <= smoothCurrentTime * 1000 的最后一条
  // 无歌词或当前时间早于第一行 → 返回 -1（让 UI 不高亮任何行）
  //
  // 关键：splash.LyricLine.startTime 单位是毫秒，smoothCurrentTime 单位是秒 → 需 * 1000
  // 用 smoothCurrentTime（rAF 60fps）而非 playback.currentTime（timeupdate 4Hz），
  // 保证歌词行高亮及时切换（4Hz 会有 250ms 延迟）
  // Vue computed 有缓存：smoothCurrentTime 60fps 变化，但 currentLyricIndex 只在
  // 二分查找结果（index）变化时才触发下游重渲染
  const currentLyricIndex = computed(() => {
    const arr = lines.value
    if (arr.length === 0) return -1
    const t = smoothCurrentTime.value * 1000 // 秒 → 毫秒
    if (t < arr[0].startTime) return -1
    // 二分查找：找到最大的 i 使 arr[i].startTime <= t
    let lo = 0
    let hi = arr.length - 1
    let ans = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid].startTime <= t) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return ans
  })

  // 查询状态（UI 显示 loading / error）
  const isLoading = computed(() => lyricsQuery.isLoading.value)
  const error = computed(() => lyricsQuery.error.value)

  // 错误信息（多源全失败时主进程会落盘 errorMessage，优先展示；否则展示 query error）
  const errorMessage = computed(() => {
    // 主进程落盘的错误信息（避免反复重试）
    if (lyricFile.value?.errorMessage) return lyricFile.value.errorMessage
    if (error.value instanceof Error) return error.value.message
    return null
  })

  return {
    // 查询状态
    isLoading,
    error,
    errorMessage,
    // 数据
    lyricFile,
    lines,
    hasTranslation,
    currentLyricIndex,
  }
})
