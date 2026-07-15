<script setup lang="ts">
import { ref } from 'vue'

const tabs = [
  { key: 'local', label: '本地收藏' },
  { key: 'bilibili', label: 'B站收藏' },
  { key: 'watchlater', label: '稍后再看' },
] as const

const activeTab = ref<(typeof tabs)[number]['key']>('local')

const fakePlaylists: Record<string, { title: string; count: number }[]> = {
  local: [
    { title: '我的歌单', count: 12 },
    { title: '睡前轻音乐', count: 8 },
    { title: '跑步专用', count: 24 },
  ],
  bilibili: [],
  watchlater: [],
}
</script>

<template>
  <div class="p-6">
    <h2 class="text-xl font-bold text-[var(--md-on-surface)] mb-6">音乐库</h2>

    <div class="flex gap-2 mb-6">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="px-4 py-2 rounded-full text-sm transition-colors"
        :class="
          activeTab === tab.key
            ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] font-semibold'
            : 'text-[var(--md-on-surface-variant)] bg-[var(--md-surface-container)]'
        "
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-if="fakePlaylists[activeTab].length > 0"
      class="flex flex-col gap-2"
    >
      <div
        v-for="item in fakePlaylists[activeTab]"
        :key="item.title"
        class="flex items-center justify-between h-14 px-4 bg-[var(--md-surface-container)] rounded-[var(--md-radius-sm)] cursor-pointer hover:bg-[var(--md-surface-container-high)] transition-colors"
      >
        <span class="text-sm text-[var(--md-on-surface)]">{{ item.title }}</span>
        <span class="text-xs text-[var(--md-on-surface-variant)]">{{ item.count }} 首</span>
      </div>
    </div>

    <div v-else class="text-sm text-[var(--md-on-surface-variant)] mt-8 text-center">
      暂无内容
    </div>
  </div>
</template>