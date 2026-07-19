import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Track } from '../types/track'
import { usePlayerStore } from './player'
import { useQueueStore } from './queue'

// ── playback store（播放控制 + 编排）──
// 参考 BBPlayer：播放控制状态独立于队列数据
// 包含：isPlaying / currentTime / volume / playMode + play/pause/seek/next/prev
// 编排 player store（镜像）+ queue store（数据）：写队列时同步更新 player 镜像
export const usePlaybackStore = defineStore('playback', () => {
  const player = usePlayerStore()
  const queueStore = useQueueStore()

  // ── 播放控制状态 ──
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const volume = ref(80)

  // ── 播放模式：all / one / shuffle 三态互斥（参考 BBPlayer playMode）──
  const playMode = ref<'all' | 'one' | 'shuffle'>('all')

  // ── 派生 ──
  const currentTrack = computed<Track | null>(() => player.currentTrack)
  const hasPrev = computed(() => player.queueIndex > 0)
  const hasNext = computed(() => player.queueIndex < queueStore.queue.length - 1)

  // ── 内部工具：把 queueIndex 写回 player 镜像 ──
  function syncMirror(index: number) {
    player.queueIndex = index
    player.currentTrack = queueStore.queue[index] ?? null
  }

  // ── 播放控制 ──

  // 播放指定曲目：
  // - 若已在队列中：跳到该索引
  // - 若不在：追加到末尾并跳到末尾
  function play(track: Track) {
    const idx = queueStore.findIndex(track.id)
    const targetIndex = idx !== -1 ? idx : queueStore.append(track)
    syncMirror(targetIndex)
    isPlaying.value = true
    currentTime.value = 0
  }

  // 播放整个歌单：替换队列，从 startIndex 开始
  function playAll(tracks: Track[], startIndex = 0) {
    queueStore.setQueue(tracks, startIndex)
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
    isPlaying.value ? pause() : resume()
  }

  function next() {
    // 单曲循环：仅重置进度，不切歌
    if (playMode.value === 'one') {
      currentTime.value = 0
      return
    }
    if (hasNext.value) {
      syncMirror(player.queueIndex + 1)
    } else if (playMode.value === 'all') {
      // 列表循环：回到第一首
      syncMirror(0)
    } else {
      isPlaying.value = false
      return
    }
    isPlaying.value = true
    currentTime.value = 0
  }

  function prev() {
    if (hasPrev.value) {
      syncMirror(player.queueIndex - 1)
      isPlaying.value = true
      currentTime.value = 0
    }
  }

  function seek(time: number) {
    currentTime.value = time
  }

  function setVolume(v: number) {
    volume.value = v
  }

  // 从队列中移除指定索引（编排 player + queue）
  function removeFromQueue(index: number) {
    const result = queueStore.removeAt(index, player.queueIndex)
    if (result.isEmpty) {
      // 队列清空
      player.currentTrack = null
      player.queueIndex = 0
      isPlaying.value = false
      currentTime.value = 0
      return
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
  function cyclePlayMode() {
    if (playMode.value === 'all') playMode.value = 'one'
    else if (playMode.value === 'one') playMode.value = 'shuffle'
    else playMode.value = 'all'
  }

  return {
    // 状态
    isPlaying,
    currentTime,
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
    removeFromQueue,
    cyclePlayMode,
  }
})
