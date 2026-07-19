import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface Track {
  id: string
  title: string
  artist: string
  coverUrl: string
  duration: number
}

const fakeQueue: Track[] = [
  { id: '1', title: '光るなら', artist: 'Goose house', coverUrl: '', duration: 245 },
  { id: '2', title: 'Only My Railgun', artist: 'fripSide', coverUrl: '', duration: 268 },
  { id: '3', title: '紅蓮華', artist: 'LiSA', coverUrl: '', duration: 238 },
  { id: '4', title: '青空のラプソディ', artist: 'fhána', coverUrl: '', duration: 274 },
]

export const usePlayerStore = defineStore('player', () => {
  const queue = ref<Track[]>(fakeQueue)
  const queueIndex = ref(0)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const volume = ref(80)
  const shuffle = ref(false)
  // 默认 all（列表循环），不再有 off 态
  const repeat = ref<'off' | 'all' | 'one'>('all')

  const currentTrack = computed<Track | null>(() => {
    if (queue.value.length === 0) return null
    return queue.value[queueIndex.value] ?? null
  })

  const hasPrev = computed(() => queueIndex.value > 0)
  const hasNext = computed(() => queueIndex.value < queue.value.length - 1)

  function play(track: Track) {
    const idx = queue.value.findIndex((t) => t.id === track.id)
    if (idx !== -1) {
      queueIndex.value = idx
    } else {
      queue.value.push(track)
      queueIndex.value = queue.value.length - 1
    }
    isPlaying.value = true
    currentTime.value = 0
  }

  function pause() {
    isPlaying.value = false
  }

  function resume() {
    if (currentTrack.value) {
      isPlaying.value = true
    }
  }

  function next() {
    if (repeat.value === 'one') {
      currentTime.value = 0
      return
    }
    if (hasNext.value) {
      queueIndex.value++
    } else if (repeat.value === 'all') {
      queueIndex.value = 0
    } else {
      isPlaying.value = false
      return
    }
    isPlaying.value = true
    currentTime.value = 0
  }

  function prev() {
    if (hasPrev.value) {
      queueIndex.value--
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

  // 统一的播放模式：把 repeat + shuffle 视作互斥三态
  // all → one → shuffle → all，UI 按钮只暴露这一个
  type PlayMode = 'all' | 'one' | 'shuffle'
  const playMode = computed<PlayMode>(() => {
    if (shuffle.value) return 'shuffle'
    return repeat.value === 'one' ? 'one' : 'all'
  })
  function cyclePlayMode() {
    // 直接读底层 ref，避免依赖 computed 的读取时机
    if (shuffle.value) {
      // shuffle → all
      shuffle.value = false
      repeat.value = 'all'
    } else if (repeat.value === 'one') {
      // one → shuffle
      shuffle.value = true
      repeat.value = 'all'
    } else {
      // all → one
      repeat.value = 'one'
    }
  }

  return {
    queue,
    queueIndex,
    isPlaying,
    currentTime,
    volume,
    shuffle,
    repeat,
    currentTrack,
    hasPrev,
    hasNext,
    play,
    pause,
    resume,
    next,
    prev,
    setVolume,
    playMode,
    cyclePlayMode,
    seek,
  }
})