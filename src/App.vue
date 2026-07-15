<script setup lang="ts">
import Sidebar from './components/layout/Sidebar.vue'
import NowPlayingBar from './components/layout/NowPlayingBar.vue'
</script>

<template>
  <div
    class="flex h-screen bg-[var(--md-surface)] text-[var(--md-on-surface)]"
  >
    <Sidebar />
    <main class="flex-1 flex flex-col overflow-auto">
      <RouterView />
    </main>
    <NowPlayingBar />
  </div>
</template>
