// 渲染进程歌词同步逻辑（手动滚动 2s 防抖回弹 + 点击跳转防并发）
//
// 参考 BBPlayer useLyricSync（apps/mobile/src/features/player/hooks/useLyricSync.ts）
// 核心策略：
// - 当前行索引变化时，自动滚动到该行（smooth），但仅在"非手动滚动中"时
// - 用户手动滚动 → 标记 isManualScrolling，2s 内无新操作则清除标志并强制滚回当前行
// - 点击歌词跳转 → 防并发（latestJumpRequestRef），seek 完成后清除手动滚动标志并更新索引
//
// 与 BBPlayer 的差异：
// - BBPlayer 用 Reanimated SharedValue + useAnimatedReaction（UI 线程）
// - 本项目用 Vue ref + watch（主线程），currentLyricIndex 来自 lyric store computed
// - BBPlayer 行索引由 2Hz 原生事件驱动；本项目由 lyric store computed 驱动（消费 playback.smoothCurrentTime 60fps）
//   但 computed 有缓存：index 不变则不触发 watch，等效于"仅在行变化时才滚动"
import { onScopeDispose, ref, watch } from 'vue'

import type { LyricLine } from '../types/lyric'

// 防抖时间：用户停止滚动后 2s 回弹到当前行（与 BBPlayer 一致）
const MANUAL_SCROLL_DEBOUNCE_MS = 2000

export interface UseLyricSyncOptions {
  // 歌词行数组（用于长度判断）
  lines: () => LyricLine[]
  // 当前歌词行索引（来自 lyric store computed）
  currentLyricIndex: () => number
  // 滚动到指定行（由 LyricView 提供，传入 smooth 参数控制动画）
  scrollToIndex: (index: number, smooth: boolean) => void
  // seek 到指定时间（秒），由 LyricView 传入 playback.seek
  seekTo: (timeSec: number) => void
}

/**
 * 歌词同步逻辑
 *
 * 返回：
 * - isManualScrolling：当前是否在手动滚动中（供模板控制是否显示"回弹"提示等）
 * - onUserScrollStart / onUserScrollEnd：手动滚动事件回调（绑到 scroll 容器的 wheel/touchstart）
 * - handleJumpToLyric：点击歌词行跳转
 */
export function useLyricSync(options: UseLyricSyncOptions) {
  const { lines, currentLyricIndex, scrollToIndex, seekTo } = options

  // 手动滚动状态
  const isManualScrolling = ref(false)
  let manualScrollTimeout: ReturnType<typeof setTimeout> | null = null

  // 点击跳转防并发：每次点击递增 requestId，旧请求的回调失效
  let latestJumpRequestId = 0

  // ── 手动滚动：开始（用户开始滚动时调）──
  // 清掉未触发的回弹定时器，标记为手动滚动中
  function onUserScrollStart() {
    if (lines().length === 0) return
    if (manualScrollTimeout !== null) {
      clearTimeout(manualScrollTimeout)
      manualScrollTimeout = null
    }
    isManualScrolling.value = true
  }

  // ── 手动滚动：结束（用户停止滚动时调）──
  // 启动 2s 防抖定时器，到期后清除标志并强制滚回当前行
  function onUserScrollEnd() {
    if (lines().length === 0) return
    if (manualScrollTimeout !== null) {
      clearTimeout(manualScrollTimeout)
    }
    manualScrollTimeout = setTimeout(() => {
      manualScrollTimeout = null
      isManualScrolling.value = false
      // 2s 后强制滚回当前行（smooth 动画）
      const idx = currentLyricIndex()
      if (idx >= 0) {
        scrollToIndex(idx, true)
      }
    }, MANUAL_SCROLL_DEBOUNCE_MS)
  }

  // ── 点击歌词行跳转 ──
  // 防并发：用户快速连点时，旧 seek 完成回调失效（latestJumpRequestId 不匹配）
  // seek 是异步的（HTMLAudioElement.seeked 事件），但 Vue 的 seek 调用是同步触发；
  // 这里用 await Promise.resolve() 模拟 BBPlayer 的 await Orpheus.seekTo() 语义，
  // 保证 requestId 检查在"seek 完成"后执行（即便实际是同步的，逻辑上也正确）
  async function handleJumpToLyric(index: number) {
    const arr = lines()
    if (arr.length === 0) return
    const line = arr[index]
    if (!line) return

    const requestId = ++latestJumpRequestId
    // splash.LyricLine.startTime 是毫秒，seekTo 接收秒
    seekTo(line.startTime / 1000)

    // 模拟异步等待（HTMLAudioElement.seek 实际有 seeked 事件，但 Vue store 的 seek 是同步调用）
    // 用 microtask 确保 requestId 检查在调用方之后执行
    await Promise.resolve()
    if (latestJumpRequestId !== requestId) return

    // 清除手动滚动标志（点击跳转后应立即跟随）
    if (manualScrollTimeout !== null) {
      clearTimeout(manualScrollTimeout)
      manualScrollTimeout = null
    }
    isManualScrolling.value = false

    // 跳转后立即滚动到目标行（不等 currentLyricIndex computed 更新）
    scrollToIndex(index, true)
  }

  // ── 当前行变化时自动滚动 ──
  // 参考 BBPlayer useAnimatedReaction：仅在 index 变化时触发，且非手动滚动中
  // Vue watch 自带"仅在值变化时触发"语义，无需额外判断 index === prevIndex
  watch(currentLyricIndex, (idx) => {
    if (idx < 0) return
    // 手动滚动中或防抖定时器未触发 → 不自动跟随（让用户能自由浏览）
    if (isManualScrolling.value || manualScrollTimeout !== null) return
    scrollToIndex(idx, true)
  })

  // 清理：组件卸载时清除定时器
  onScopeDispose(() => {
    if (manualScrollTimeout !== null) {
      clearTimeout(manualScrollTimeout)
      manualScrollTimeout = null
    }
  })

  return {
    isManualScrolling,
    onUserScrollStart,
    onUserScrollEnd,
    handleJumpToLyric,
  }
}
