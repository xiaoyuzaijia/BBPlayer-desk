import { watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { usePlaybackStore } from '../stores/playback'

/**
 * 播放进度管理组合式函数
 *
 * 每秒更新一次 currentTime，当播放到末尾时自动切换至下一曲。
 * 通过监听 isPlaying 状态自动启停定时器。
 */
export function usePlaybackProgress() {
  // 进度定时器依赖 playback store 的控制状态（isPlaying/currentTime/next）
  const playback = usePlaybackStore()

  // 每秒递增 currentTime，到达曲目末尾则切歌
  const { pause, resume } = useIntervalFn(() => {
    const track = playback.currentTrack
    if (!track) return

    if (playback.currentTime < track.duration) {
      playback.currentTime++           // 进度 +1 秒
    } else {
      playback.next()                  // 播完自动下一首
    }
  }, 1000, { immediate: false })     // 不立即启动，由播放状态控制

  // 监听播放/暂停状态，自动启停进度定时器
  watch(() => playback.isPlaying, (playing) => {
    if (playing) resume()
    else pause()
  }, { immediate: true })            // 立即执行一次，保证初始状态同步
}
