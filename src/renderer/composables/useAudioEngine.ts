// 渲染进程播放引擎：<audio> 元素与 playback store 的双向绑定
//
// 职责：
// - 维护全局唯一的 HTMLAudioElement
// - watch currentTrack.id → 调 window.api.playback.getAudioUrl → 设置 audio.src → play
// - audio 事件 → playback store（timeupdate / play / pause / ended / error）
// - playback store → audio 元素（isPlaying / volume / currentTime seek）
//
// 关键决策：
// - <audio> timeupdate 事件回写 currentTime，偏差 > 0.5s 时才同步 audio.currentTime（防死循环）
// - audio error 事件触发 refreshAudioUrl（可能 URL 过期）
// - ended 事件：写播放历史 + 切下一首（不阻塞切歌）
// - App.vue onMounted 调一次 useAudioEngine()，整个应用共享一个 audio 元素
import { watch } from 'vue'

import { usePlaybackStore } from '../stores/playback'
import { usePlayerStore } from '../stores/player'

// 全局唯一的 audio 元素（首次调用 ensureAudioEl 时创建）
let audioEl: HTMLAudioElement | null = null

// 防止 ended 事件在短时间内重复触发（某些情况下 ended 会触发两次）
let endedHandling = false

export function useAudioEngine() {
  const playback = usePlaybackStore()
  const player = usePlayerStore()

  function ensureAudioEl(): HTMLAudioElement {
    if (audioEl) return audioEl

    const el = new Audio()
    el.preload = 'auto'

    // ── audio 事件 → playback store ──

    el.addEventListener('timeupdate', () => {
      playback.setCurrentTime(el.currentTime)
    })

    el.addEventListener('play', () => {
      playback.setIsPlaying(true)
    })

    el.addEventListener('pause', () => {
      // 仅在非 ended 引起的 pause 时同步为 false
      // ended 事件会单独处理切歌，不在这里改 isPlaying
      if (!el.ended) playback.setIsPlaying(false)
    })

    el.addEventListener('ended', () => {
      if (endedHandling) return
      endedHandling = true

      // 写播放历史（异步，不阻塞切歌）
      const track = player.currentTrack
      if (track) {
        const startTime = Date.now() - el.currentTime * 1000
        const durationPlayed = Math.floor(el.currentTime)
        // 播放到末尾视为完成
        const completed = el.duration > 0 && el.currentTime >= el.duration - 5
        window.api.history
          .record({
            trackId: track.id,
            startTime,
            durationPlayed,
            completed,
          })
          .catch((e: unknown) =>
            console.error('[audioEngine] history.record failed', e),
          )
      }

      // 切下一首（playback.next 会重置 currentTime=0 并切 currentTrack）
      playback.next()
      // 下一个 tick 解锁，让下次 ended 能再触发
      setTimeout(() => {
        endedHandling = false
      }, 0)
    })

    el.addEventListener('error', async () => {
      // 音频流 URL 可能过期 → 尝试 refresh
      const track = player.currentTrack
      if (!track) return
      console.warn('[audioEngine] audio error, refreshing audio url for track', track.id)
      const r = await window.api.playback.refreshAudioUrl(track.id)
      if (r.ok) {
        el.src = r.data
        el.play().catch((e: unknown) =>
          console.error('[audioEngine] replay after refresh failed', e),
        )
      } else {
        console.error('[audioEngine] refreshAudioUrl failed', r.error)
      }
    })

    audioEl = el
    return el
  }

  function applyVolume(v: number) {
    if (audioEl) audioEl.volume = Math.min(1, Math.max(0, v / 100))
  }

  // ── watch：playback store → audio 元素 ──

  // 当前曲目变化 → 拉音频 URL → play
  watch(
    () => player.currentTrack?.id,
    async (trackId) => {
      if (trackId === undefined || trackId === null) {
        audioEl?.pause()
        audioEl?.removeAttribute('src')
        return
      }
      const el = ensureAudioEl()
      const r = await window.api.playback.getAudioUrl(trackId)
      if (!r.ok) {
        console.error('[audioEngine] getAudioUrl failed', r.error)
        return
      }
      el.src = r.data
      if (playback.isPlaying) {
        el.play().catch((e: unknown) =>
          console.error('[audioEngine] play failed', e),
        )
      }
    },
    { immediate: true },
  )

  // isPlaying → play/pause
  watch(
    () => playback.isPlaying,
    (isPlaying) => {
      if (!audioEl) return
      if (isPlaying) {
        audioEl.play().catch((e: unknown) =>
          console.error('[audioEngine] play() failed', e),
        )
      } else {
        audioEl.pause()
      }
    },
  )

  // volume → audio.volume
  watch(
    () => playback.volume,
    (v) => applyVolume(v),
    { immediate: true },
  )

  // currentTime → audio.currentTime（仅在大偏差时同步，避免 timeupdate 回写死循环）
  watch(
    () => playback.currentTime,
    (t) => {
      if (!audioEl) return
      if (Math.abs(audioEl.currentTime - t) > 0.5) {
        audioEl.currentTime = t
      }
    },
  )

  return { ensureAudioEl }
}
