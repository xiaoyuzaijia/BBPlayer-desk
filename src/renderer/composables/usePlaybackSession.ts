// 播放会话持久化：退出时保存 + 启动时恢复（不自动播放）
//
// 启动：onMounted 调 window.api.playback.restoreSession() → 写入 playback store
// 退出：订阅主进程 saveSessionRequest 推送 → 收集快照 → window.api.playback.saveSession
//       （主进程写盘后自行销毁窗口 + 退出）
import { onMounted, onUnmounted } from 'vue'

import { usePlaybackStore } from '../stores/playback'
import { usePlayerStore } from '../stores/player'
import { useQueueStore } from '../stores/queue'

export function usePlaybackSession() {
  const playback = usePlaybackStore()
  const player = usePlayerStore()
  const queueStore = useQueueStore()

  // 启动时恢复上次会话（失败仅 log，不弹窗）
  onMounted(async () => {
    const r = await window.api.playback.restoreSession()
    if (!r.ok) {
      console.error('[usePlaybackSession] restoreSession failed', r.error)
      return
    }
    if (r.data) {
      playback.restoreSession(
        r.data.tracks,
        r.data.currentIndex,
        r.data.position,
        r.data.playMode,
        r.data.volume,
      )
    }
  })

  // 订阅退出前保存请求：收到后立即收集快照回传
  const offSaveRequest = window.api.playback.onSaveSessionRequest(() => {
    const snapshot = {
      trackIds: queueStore.queue.map((t) => t.id),
      currentIndex: player.queueIndex,
      position: playback.currentTime,
      playMode: playback.playMode,
      volume: playback.volume,
    }
    window.api.playback
      .saveSession(snapshot)
      .catch((e: unknown) =>
        console.error('[usePlaybackSession] saveSession failed', e),
      )
  })

  onUnmounted(() => offSaveRequest())
}
