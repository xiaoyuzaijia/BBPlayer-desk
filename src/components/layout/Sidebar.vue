<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { name: 'home', label: '首页', icon: '🏠' },
  { name: 'library', label: '音乐库', icon: '📚' },
  { name: 'settings', label: '设置', icon: '⚙️' },
]
</script>

<template>
  <nav
    class="w-[220px] flex-shrink-0 h-screen border-r border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] flex flex-col pt-4"
  >
    <div class="px-5 pb-6 text-lg font-bold text-[var(--md-on-surface)]">
      BBPlayer
    </div>
    <RouterLink
      v-for="item in navItems"
      :key="item.name"
      :to="{ name: item.name }"
      class="flex items-center gap-3 mx-3 h-12 px-3 rounded-[var(--md-radius-sm)] text-[var(--md-on-surface-variant)] no-underline transition-colors"
      :class="{
        'bg-[var(--md-primary-container)] text-[var(--md-primary)]!':
          route.name === item.name,
      }"
    >
      <span>{{ item.icon }}</span>
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
