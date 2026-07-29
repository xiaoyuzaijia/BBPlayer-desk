import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Track } from '../types/track'

// ── player store（极简镜像）──
// 参考 BBPlayer usePlayerStore：只镜像"当前播放曲目 + 当前队列索引"
// 不承载队列数据、不承载播放控制状态、不放 action
// 真源在 queue store（队列）+ playback store（控制），本 store 只做派生
export const usePlayerStore = defineStore('player', () => {
  // 当前播放曲目（直接 ref，由 playback.play 写入）
  const currentTrack = ref<Track | null>(null)
  // 当前在队列中的索引（由 playback action 同步写入）
  const queueIndex = ref(0)

  // 派生：当前曲目 id（便于列表高亮 selector），null 时返回 null
  const currentTrackId = computed(() => currentTrack.value?.id ?? null)

  return {
    currentTrack,
    queueIndex,
    currentTrackId,
  }
})
