<script setup lang="ts">
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../../stores/player'

const router = useRouter()
const player = usePlayerStore()
const { currentTrack, isPlaying } = storeToRefs(player)
</script>

<template>
  <div
    v-if="currentTrack"
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 h-14 flex items-center gap-3 px-3 bg-[var(--md-surface-container-high)] rounded-[var(--md-radius-lg)] shadow-lg cursor-pointer select-none"
    @click="router.push({ name: 'player' })"
  >
    <div class="w-12 h-12 rounded-[var(--md-radius-sm)] bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
      <span class="text-sm">🎵</span>
    </div>

    <div class="flex flex-col min-w-0 mr-2">
      <span class="text-sm font-semibold text-[var(--md-on-surface)] truncate">
        {{ currentTrack.title }}
      </span>
      <span class="text-xs text-[var(--md-on-surface-variant)] truncate">
        {{ currentTrack.artist }}
      </span>
    </div>

    <button
      class="text-lg text-[var(--md-on-surface)] select-none"
      @click.stop="isPlaying ? player.pause() : player.resume()"
    >
      {{ isPlaying ? '⏸' : '▶️' }}
    </button>

    <button
      class="text-lg text-[var(--md-on-surface-variant)] select-none"
      @click.stop="player.next()"
    >
      ⏭
    </button>
  </div>
</template>
