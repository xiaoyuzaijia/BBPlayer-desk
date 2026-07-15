<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'

const player = usePlayerStore()
const { currentTrack, isPlaying, currentTime, hasPrev, hasNext } = storeToRefs(player)
</script>

<template>
  <div v-if="currentTrack" class="flex items-center justify-center h-full gap-16 px-16">
    <div class="flex-shrink-0 w-[400px] aspect-square rounded-[var(--md-radius-lg)] bg-gradient-to-br from-purple-400 via-pink-400 to-orange-300 flex items-center justify-center">
      <span class="text-white/30 text-8xl font-bold select-none">🎵</span>
    </div>

    <div class="flex flex-col flex-1 max-w-md gap-8">
      <div>
        <h1 class="text-2xl font-bold text-[var(--md-on-surface)] mb-1">
          {{ currentTrack.title }}
        </h1>
        <p class="text-base text-[var(--md-on-surface-variant)]">
          {{ currentTrack.artist }}
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--md-on-surface-variant)] w-10 text-right tabular-nums">
          {{ Math.floor(currentTime / 60) }}:{{ String(Math.floor(currentTime % 60)).padStart(2, '0') }}
        </span>
        <input
          type="range"
          :max="currentTrack.duration"
          :value="currentTime"
          class="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style="accent-color: var(--md-primary)"
        />
        <span class="text-xs text-[var(--md-on-surface-variant)] w-10 tabular-nums">
          {{ Math.floor(currentTrack.duration / 60) }}:{{ String(Math.floor(currentTrack.duration % 60)).padStart(2, '0') }}
        </span>
      </div>

      <div class="flex items-center justify-center gap-8">
        <button
          class="text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)] transition-colors text-3xl select-none"
          :class="{ 'opacity-30 pointer-events-none': !hasPrev }"
          @click="player.prev()"
        >
          ⏮
        </button>
        <button
          class="w-16 h-16 flex items-center justify-center bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] rounded-full text-2xl select-none"
          @click="isPlaying ? player.pause() : player.resume()"
        >
          {{ isPlaying ? '⏸' : '▶️' }}
        </button>
        <button
          class="text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)] transition-colors text-3xl select-none"
          :class="{ 'opacity-30 pointer-events-none': !hasNext }"
          @click="player.next()"
        >
          ⏭
        </button>
      </div>

      <div class="flex items-center justify-center gap-6">
        <button class="text-[var(--md-on-surface-variant)] select-none opacity-50 text-lg">🔀</button>
        <button class="text-[var(--md-on-surface-variant)] select-none opacity-50 text-lg">🔁</button>
        <button class="text-[var(--md-on-surface-variant)] select-none opacity-50 text-lg">📋</button>
      </div>
    </div>
  </div>

  <div v-else class="flex items-center justify-center h-full">
    <p class="text-[var(--md-on-surface-variant)]">没有正在播放的曲目</p>
  </div>
</template>
