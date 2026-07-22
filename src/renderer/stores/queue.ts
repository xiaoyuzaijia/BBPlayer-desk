import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Track } from '../types/track'

// ── queue store（播放队列数据）──
// 参考 BBPlayer：队列是独立业务数据，与"当前播放镜像"分离
// 包含：队列数组 + 队列操作（增删、跳转）
// 不包含：播放/暂停/进度（这些在 playback store）
export const useQueueStore = defineStore('queue', () => {
  const queue = ref<Track[]>([])

  // 替换整个队列（用于"播放全部"）
  function setQueue(tracks: Track[], startIndex = 0) {
    queue.value = [...tracks]
    return startIndex
  }

  // 追加单首到队列末尾
  function append(track: Track) {
    queue.value.push(track)
    return queue.value.length - 1
  }

  // 查找曲目在队列中的索引（按 id），找不到返回 -1
  function findIndex(trackId: string): number {
    return queue.value.findIndex((t) => t.id === trackId)
  }

  // 从队列中移除指定索引
  // 返回值：
  // - { affectedIndex: number, shouldSwitchTrack: boolean }
  //   shouldSwitchTrack=true 表示移除的是当前播放，调用方需切到下一首
  //   affectedIndex 表示调用方需要调整的 queueIndex 偏移：
  //     -1 = queueIndex 前移；0 = 不变；下标 = 新当前索引
  function removeAt(index: number, currentQueueIndex: number) {
    if (index < 0 || index >= queue.value.length) {
      return { affectedIndex: 0, shouldSwitchTrack: false }
    }

    const wasCurrent = index === currentQueueIndex
    const wasBeforeCurrent = index < currentQueueIndex

    // 队列只剩一首：清空
    if (queue.value.length === 1) {
      queue.value.splice(0)
      return { affectedIndex: 0, shouldSwitchTrack: true, isEmpty: true }
    }

    // 移除当前播放
    if (wasCurrent) {
      const wasLast = index === queue.value.length - 1
      queue.value.splice(index, 1)
      // 移除最后一首：回到 0；否则新当前就是同下标（已自动指向下一首）
      return {
        affectedIndex: wasLast ? 0 : index,
        shouldSwitchTrack: true,
        isEmpty: false,
      }
    }

    // 移除非当前
    queue.value.splice(index, 1)
    return {
      affectedIndex: wasBeforeCurrent ? -1 : 0,
      shouldSwitchTrack: false,
      isEmpty: false,
    }
  }

  // 清空队列
  function clear() {
    queue.value.splice(0)
  }

  return {
    queue,
    setQueue,
    append,
    findIndex,
    removeAt,
    clear,
  }
})
