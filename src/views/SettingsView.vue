<script setup lang="ts">
const settingGroups = [
  {
    title: '外观',
    items: [
      { label: '暗色模式', value: '跟随系统' },
      { label: '播放器背景', value: '渐变' },
      { label: '底部播放条样式', value: '浮动' },
    ],
  },
  {
    title: '播放',
    items: [
      { label: '默认音量', value: '80%' },
      { label: '播放品质', value: '高' },
    ],
  },
  {
    title: '关于',
    items: [
      { label: '版本', value: '0.1.0' },
      { label: '开源许可', value: 'MIT' },
    ],
  },
]
</script>

<template>
  <div class="p-6">
    <h2 class="text-xl font-bold text-[var(--md-on-surface)] mb-6">设置</h2>

    <div v-for="group in settingGroups" :key="group.title" class="mb-6">
      <h3 class="text-xs font-semibold text-[var(--md-on-surface-variant)] px-4 mb-2 uppercase tracking-wider">
        {{ group.title }}
      </h3>
      <div class="bg-[var(--md-surface-container)] rounded-[var(--md-radius-md)]">
        <div
          v-for="(item, index) in group.items"
          :key="item.label"
          class="flex items-center justify-between h-14 px-5"
          :class="{ 'border-t border-[var(--md-outline-variant)]': index > 0 }"
        >
          <span class="text-sm text-[var(--md-on-surface)]">{{ item.label }}</span>
          <span class="text-sm text-[var(--md-on-surface-variant)]">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>