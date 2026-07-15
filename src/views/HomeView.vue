<script setup lang="ts">
const quickActions = [
  { title: '每日推荐', desc: '猜你喜欢' },
  { title: '最近常听', desc: '重温好歌' },
  { title: '稍后再看', desc: '待播列表' },
  { title: '历史记录', desc: '播放足迹' },
]
</script>

<template>
  <div class="p-6">
    <input
      type="text"
      placeholder="搜索歌曲、UP主..."
      class="w-full h-12 px-5 bg-[var(--md-surface-variant)] text-[var(--md-on-surface)] placeholder-[var(--md-on-surface-variant)] rounded-full outline-none text-sm mb-8"
    />

    <div class="grid grid-cols-2 gap-4">
      <div
        v-for="item in quickActions"
        :key="item.title"
        class="bg-[var(--md-surface-container)] rounded-[var(--md-radius-md)] p-5 cursor-pointer hover:bg-[var(--md-surface-container-high)] transition-colors"
      >
        <div class="text-sm font-semibold text-[var(--md-on-surface)] mb-1">
          {{ item.title }}
        </div>
        <div class="text-xs text-[var(--md-on-surface-variant)]">
          {{ item.desc }}
        </div>
      </div>
    </div>
  </div>
</template>