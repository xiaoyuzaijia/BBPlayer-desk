<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/layout/Sidebar.vue'
import NowPlayingBar from './components/layout/NowPlayingBar.vue'
import { useThemeStore } from './stores/theme'
import { usePlaybackProgress } from './composables/usePlaybackProgress'

useThemeStore()
usePlaybackProgress()

const route = useRoute()
// 进入 PlayerView 时隐藏 NowPlayingBar（避免与播放器重复显示）
const showNowPlayingBar = computed(() => route.name !== 'player')
</script>

<template>
  <div
    class="flex h-screen bg-md-surface text-md-on-surface"
  >
    <Sidebar />
    <main class="flex-1 flex flex-col overflow-auto">
      <RouterView />
    </main>
    <NowPlayingBar v-if="showNowPlayingBar" />
  </div>
</template>
