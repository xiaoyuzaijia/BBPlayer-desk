import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { PlayMode } from '../../shared/ipc-types'
import type { Track } from '../types/track'
import { usePlayerStore } from './player'
import { useQueueStore } from './queue'

// 偏差阈值：插值位置与真实位置差超过此值时，以真实位置为准重置（与 BBPlayer 一致）
const DRIFT_THRESHOLD = 0.05

// ── playback store（播放控制 + 编排）──
// 参考 BBPlayer：播放控制状态独立于队列数据
// 包含：isPlaying / currentTime / smoothCurrentTime / volume / playMode + play/pause/seek/next/prev
// 编排 player store（镜像）+ queue store（数据）：写队列时同步更新 player 镜像
//
// 双轨 currentTime 设计（参考 BBPlayer useSmoothProgress + useTrackProgress）：
// - currentTime：4Hz 真实位置（timeupdate 回写），供 useAudioEngine seek 校正、播放历史记录用
// - smoothCurrentTime：60fps rAF 插值（仅 isPlaying 时累加 + 0.05s 偏差校正），
//   供进度条、歌词 store 等需要平滑显示的 UI 消费
//   单一 rAF 循环在 store 内启动，全局共享，避免多个 composable 各起循环
export const usePlaybackStore = defineStore('playback', () => {
  const player = usePlayerStore()
  const queueStore = useQueueStore()

  // ── 播放控制状态 ──
  const isPlaying = ref(false)
  // 4Hz 真实位置（timeupdate 回写）—— 精确但不平滑
  const currentTime = ref(0)
  // 60fps 平滑位置（rAF 插值）—— 平滑但可能微小漂移（由 currentTime 校正）
  const smoothCurrentTime = ref(0)
  const volume = ref(80)

  // ── 播放模式：all / one / shuffle 三态互斥（参考 BBPlayer playMode）──
  const playMode = ref<PlayMode>('all')

  // ── shuffle 随机序：queue 索引的随机排列（参考 BBPlayer OrpheusQueueManager.shuffleIndices）──
  // 仅 shuffle 模式下有值；序列开头固定为当前曲目，next/prev 沿序列回绕移动
  const shuffleOrder = ref<number[]>([])

  // ── smoothCurrentTime 的 rAF 插值循环 ──
  // 每帧累加 deltaTime/1000（仅 isPlaying 时），由 currentTime 做偏差校正
  let rafId: number | null = null
  let lastFrameTime: number | null = null

  function tick(now: number) {
    if (lastFrameTime !== null) {
      const deltaMs = now - lastFrameTime
      if (isPlaying.value) {
        smoothCurrentTime.value += deltaMs / 1000
      }
    }
    lastFrameTime = now
    rafId = requestAnimationFrame(tick)
  }

  // 偏差校正：currentTime（timeupdate 真实位置）变化时检查
  // - 偏差 > 0.05s：以真实位置为准重置（插值漂移了）
  // - 暂停时：强制重置（暂停→恢复时位置可能跳）
  watch(currentTime, (realTime) => {
    const diff = Math.abs(smoothCurrentTime.value - realTime)
    if (diff > DRIFT_THRESHOLD || !isPlaying.value) {
      smoothCurrentTime.value = realTime
    }
  })

  // 恢复播放时重置（避免暂停→恢复时 smoothCurrentTime 漂移）
  watch(isPlaying, (playing) => {
    if (playing) {
      smoothCurrentTime.value = currentTime.value
    }
  })

  // 启动 rAF 循环（store 首次实例化时启动，应用生命周期内常驻）
  rafId = requestAnimationFrame(tick)

  // 清理：store dispose 时停止 rAF（应用卸载时）
  onScopeDispose(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  })

  // ── 派生 ──
  const currentTrack = computed<Track | null>(() => player.currentTrack)
  // shuffle 是无限随机循环：队列非空时永远有上/下一首
  // all/one：首/末按钮禁用（自然播完仍会自动回绕，属既有行为）
  const hasPrev = computed(() =>
    playMode.value === 'shuffle' ? queueStore.queue.length > 0 : player.queueIndex > 0,
  )
  const hasNext = computed(() =>
    playMode.value === 'shuffle'
      ? queueStore.queue.length > 0
      : player.queueIndex < queueStore.queue.length - 1,
  )

  // ── 内部工具：把 queueIndex 写回 player 镜像 ──
  function syncMirror(index: number) {
    player.queueIndex = index
    player.currentTrack = queueStore.queue[index] ?? null
  }

  // ── shuffle 随机序维护 ──

  // 生成随机序：[0..len-1] Fisher-Yates 洗牌，当前曲目换到序列开头
  // （BBPlayer generateShuffleIndices 语义：开启 shuffle 后从当前曲继续随机往下）
  function generateShuffleOrder() {
    const indices = queueStore.queue.map((_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    const pos = indices.indexOf(player.queueIndex)
    if (pos > 0) {
      ;[indices[0], indices[pos]] = [indices[pos], indices[0]]
    }
    shuffleOrder.value = indices
  }

  function clearShuffleOrder() {
    shuffleOrder.value = []
  }

  // 队列移除后同步随机序：去掉被删索引，其余 > 该索引的统一前移对齐偏移
  function removeFromShuffleOrder(removedIndex: number) {
    shuffleOrder.value = shuffleOrder.value
      .filter((i) => i !== removedIndex)
      .map((i) => (i > removedIndex ? i - 1 : i))
  }

  // 沿随机序移动一步（dir=1 下一首 / -1 上一首），越界回绕，返回目标 queueIndex
  function shuffleStep(dir: 1 | -1): number {
    let order = shuffleOrder.value
    let pos = order.indexOf(player.queueIndex)
    if (pos === -1) {
      // 当前索引不在随机序（队列被外部改动的兜底）：重新洗牌后当前曲必在序列开头
      generateShuffleOrder()
      order = shuffleOrder.value
      pos = 0
    }
    return order[(pos + dir + order.length) % order.length]
  }

  // ── 播放控制 ──

  // 播放指定曲目：
  // - 若已在队列中：跳到该索引
  // - 若不在：追加到末尾并跳到末尾（shuffle 下新索引排到随机序末尾，BBPlayer 行为）
  function play(track: Track) {
    const idx = queueStore.findIndex(track.id)
    const targetIndex = idx !== -1 ? idx : queueStore.append(track)
    if (idx === -1 && playMode.value === 'shuffle') {
      shuffleOrder.value.push(targetIndex)
    }
    syncMirror(targetIndex)
    isPlaying.value = true
    currentTime.value = 0
  }

  // 播放整个歌单：替换队列，从 startIndex 开始
  // shuffle 下队列被整体替换：重新洗牌（startIndex 提到随机序开头）
  function playAll(tracks: Track[], startIndex = 0) {
    queueStore.setQueue(tracks, startIndex)
    if (playMode.value === 'shuffle') {
      generateShuffleOrder()
    }
    syncMirror(startIndex)
    isPlaying.value = true
    currentTime.value = 0
  }

  // 跳到队列中指定索引
  function playQueueIndex(index: number) {
    if (index < 0 || index >= queueStore.queue.length) return
    syncMirror(index)
    isPlaying.value = true
    currentTime.value = 0
  }

  function pause() {
    isPlaying.value = false
  }

  function resume() {
    if (player.currentTrack) isPlaying.value = true
  }

  function togglePlay() {
    if (isPlaying.value) pause()
    else resume()
  }

  // 切下一首（手动点按钮；自然播完由 useAudioEngine 的 ended 处理）
  // - shuffle：沿随机序前进（越尾回绕）
  // - all/one：顺序前进，末尾回第一首（列表循环；one 的自然播完重播在 engine 层处理）
  // 单曲队列会回绕到自身：重置进度即可（播放中 seek 自动继续，暂停则由 isPlaying 触发播放）
  function next() {
    if (queueStore.queue.length === 0) return
    const target =
      playMode.value === 'shuffle'
        ? shuffleStep(1)
        : hasNext.value
          ? player.queueIndex + 1
          : 0
    if (target === player.queueIndex) {
      currentTime.value = 0
      isPlaying.value = true
      return
    }
    syncMirror(target)
    isPlaying.value = true
    currentTime.value = 0
  }

  // 切上一首：shuffle 沿随机序后退（越头回绕）；all/one 顺序后退（开头不动）
  function prev() {
    if (queueStore.queue.length === 0) return
    if (playMode.value === 'shuffle') {
      const target = shuffleStep(-1)
      if (target !== player.queueIndex) {
        syncMirror(target)
        isPlaying.value = true
        currentTime.value = 0
      }
      return
    }
    if (hasPrev.value) {
      syncMirror(player.queueIndex - 1)
      isPlaying.value = true
      currentTime.value = 0
    }
  }

  function seek(time: number) {
    currentTime.value = time
  }

  // 由 useAudioEngine 调用：<audio> timeupdate 事件回写当前时间
  // 与 seek 的区别：seek 是用户主动拖动，setCurrentTime 是 audio 元素被动同步
  function setCurrentTime(t: number) {
    currentTime.value = t
  }

  // 由 useAudioEngine 调用：<audio> play/pause 事件回写播放状态
  function setIsPlaying(v: boolean) {
    isPlaying.value = v
  }

  function setVolume(v: number) {
    volume.value = v
  }

  // 从队列中移除指定索引（编排 player + queue + shuffleOrder）
  function removeFromQueue(index: number) {
    const result = queueStore.removeAt(index, player.queueIndex)
    if (result.isEmpty) {
      // 队列清空
      player.currentTrack = null
      player.queueIndex = 0
      isPlaying.value = false
      currentTime.value = 0
      clearShuffleOrder()
      return
    }
    // shuffle 下同步随机序：去掉被删索引并对其后的索引前移
    if (playMode.value === 'shuffle') {
      removeFromShuffleOrder(index)
    }
    if (result.shouldSwitchTrack) {
      // 移除的是当前播放：切到新当前索引
      syncMirror(result.affectedIndex)
      isPlaying.value = true
      currentTime.value = 0
    } else if (result.affectedIndex !== 0) {
      // 移除当前之前的：queueIndex 前移，currentTrack 不变
      player.queueIndex += result.affectedIndex
    }
  }

  // 循环切换播放模式：all → one → shuffle → all
  // 切到 shuffle：以当前曲为起点生成随机序；切走：清空随机序
  function cyclePlayMode() {
    if (playMode.value === 'all') playMode.value = 'one'
    else if (playMode.value === 'one') {
      playMode.value = 'shuffle'
      generateShuffleOrder()
    } else {
      playMode.value = 'all'
      clearShuffleOrder()
    }
  }

  // 恢复上次会话（启动时由 usePlaybackSession 调用，快照来自主进程）
  // 恢复队列 + 当前曲目 + 进度 + 偏好，不自动播放（isPlaying=false 等用户点播放）
  function restoreSession(
    tracks: Track[],
    index: number,
    position: number,
    mode: PlayMode,
    vol: number,
  ) {
    queueStore.setQueue(tracks, index)
    playMode.value = mode
    if (mode === 'shuffle') {
      // 洗牌会把当前曲（index）提到随机序开头
      generateShuffleOrder()
    } else {
      clearShuffleOrder()
    }
    syncMirror(index)
    isPlaying.value = false
    currentTime.value = position
    smoothCurrentTime.value = position
    volume.value = vol
  }

  return {
    // 状态
    isPlaying,
    currentTime,
    smoothCurrentTime,
    volume,
    playMode,
    // 派生
    currentTrack,
    hasPrev,
    hasNext,
    // 动作
    play,
    playAll,
    playQueueIndex,
    pause,
    resume,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    setCurrentTime,
    setIsPlaying,
    removeFromQueue,
    cyclePlayMode,
    restoreSession,
  }
})
