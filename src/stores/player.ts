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
    if (hasNext.value) {
      queueIndex.value++
      isPlaying.value = true
      currentTime.value = 0
    }
  }

  function prev() {
    if (hasPrev.value) {
      queueIndex.value--
      isPlaying.value = true
      currentTime.value = 0
    }
  }

  return {
    queue,
    queueIndex,
    isPlaying,
    currentTime,
    currentTrack,
    hasPrev,
    hasNext,
    play,
    pause,
    resume,
    next,
    prev,
  }
})