<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Icons } from '../utils/icons'

// 分组顺序：按 icons.ts 注释中的分组整理（账号组图标并入设置组）
const groupOrder = ['导航', '播放控制', '操作', '内容', '设置'] as const

// 每个 key 归属哪个分组（账号组图标归入设置组展示）
const keyToGroup: Record<string, (typeof groupOrder)[number]> = {
  // 导航
  home: '导航', library: '导航', settings: '导航',
  explore: '导航', radio: '导航', podcast: '导航',
  // 播放控制
  play: '播放控制', pause: '播放控制', skipNext: '播放控制', skipPrev: '播放控制',
  fastForward: '播放控制', rewind: '播放控制', shuffle: '播放控制', repeat: '播放控制',
  repeatOne: '播放控制', queue: '播放控制', list: '播放控制', stop: '播放控制', eject: '播放控制',
  // 操作
  search: '操作', chevronDown: '操作', chevronUp: '操作', chevronLeft: '操作',
  chevronRight: '操作', more: '操作', moreHoriz: '操作', close: '操作', check: '操作',
  add: '操作', remove: '操作', edit: '操作', delete: '操作', menu: '操作', menuOpen: '操作',
  refresh: '操作', undo: '操作', redo: '操作', dragHandle: '操作', filter: '操作', sort: '操作',
  // 内容
  heart: '内容', heartOutline: '内容', bookmark: '内容', bookmarkOutline: '内容',
  share: '内容', history: '内容', clock: '内容', calendar: '内容', download: '内容',
  downloadDone: '内容', upload: '内容', pin: '内容', cloud: '内容', cloudOff: '内容', musicNote: '内容', album: '内容', mic: '内容',
  lyrics: '内容', equalizer: '内容', graphicEq: '内容', volumeUp: '内容', volumeDown: '内容',
  volumeMute: '内容', volumeOff: '内容', playlistAdd: '内容', playlistPlay: '内容',
  trendingUp: '内容', trendingDown: '内容', fire: '内容', star: '内容',
  // 设置
  palette: '设置', info: '设置', help: '设置', person: '设置', logout: '设置',
  darkMode: '设置', lightMode: '设置', notifications: '设置', language: '设置',
  storage: '设置', security: '设置', tune: '设置',
}

// 自动从 Icons 对象生成 items，按 groupOrder 排序
const groups = groupOrder.map((title) => ({
  title,
  items: Object.entries(Icons)
    .filter(([key]) => keyToGroup[key] === title)
    .map(([key, icon]) => ({ key, icon })),
}))

// 点击卡片复制图标字符串到剪贴板
async function copyIcon(icon: string) {
  try {
    await navigator.clipboard.writeText(icon)
  } catch {
    // 剪贴板 API 在非 HTTPS 或旧浏览器可能失败，静默忽略
  }
}
</script>

<template>
  <div class="p-8 max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold text-md-on-surface mb-2">
      图标库
    </h1>
    <p class="text-md-on-surface-variant mb-8">
      所有 Icons 常量里的图标。点击卡片可复制图标字符串。
    </p>

    <!-- 分组展示：每组一个 section，标题 + 网格 -->
    <section
      v-for="group in groups"
      :key="group.title"
      class="mb-10"
    >
      <h2 class="text-xl font-semibold text-md-on-surface mb-4 border-b border-md-outline-variant pb-2">
        {{ group.title }}
      </h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <button
          v-for="item in group.items"
          :key="item.key"
          type="button"
          class="icon-card group"
          :title="`点击复制：${item.icon}`"
          @click="copyIcon(item.icon)"
        >
          <Icon
            :icon="item.icon"
            :width="32"
            :height="32"
          />
          <span class="icon-key">{{ item.key }}</span>
          <span class="icon-string">{{ item.icon }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 图标卡片：MD3 风格，hover 时 state-layer 反馈 */
.icon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border: 1px solid var(--md-outline-variant);
  border-radius: 12px;
  background: var(--md-surface);
  color: var(--md-on-surface);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.icon-card:hover {
  background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
  border-color: var(--md-primary);
}
.icon-card:active {
  background: color-mix(in srgb, var(--md-on-surface) 12%, transparent);
}

/* 图标 key（语义名） */
.icon-key {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-on-surface);
}

/* 图标完整字符串（iconify 路径） */
.icon-string {
  font-size: 11px;
  color: var(--md-on-surface-variant);
  font-family: ui-monospace, monospace;
  text-align: center;
  word-break: break-all;
  line-height: 1.3;
}
</style>
