<script setup lang="ts">
import type { LyricLine } from '../../types/lyric'

// 单行歌词组件：主歌词 + 可选翻译
// 当前行（active=true）放大 + primary 色；非当前行 on-surface-variant
// 点击整行触发 seek 事件，由父组件调用 playback.seek(line.time)

defineProps<{
  line: LyricLine
  active: boolean
  hasTranslation: boolean  // 全局是否含翻译（即便某行无 translation，也按此控制渲染）
}>()

defineEmits<{
  seek: [time: number]
}>()
</script>

<template>
  <button
    type="button"
    class="lyric-line"
    :class="{ 'lyric-line--active': active }"
    @click="$emit('seek', line.time)"
  >
    <p class="lyric-line__main">
      {{ line.text }}
    </p>
    <p
      v-if="hasTranslation && line.translation"
      class="lyric-line__translation"
    >
      {{ line.translation }}
    </p>
  </button>
</template>

<style scoped>
.lyric-line {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s ease, transform 0.2s ease;
  color: var(--md-on-surface-variant);
  /* 用 transform 做缩放，避免影响布局 */
  transform-origin: left center;
}
.lyric-line:hover {
  background: color-mix(in srgb, var(--md-on-surface) 6%, transparent);
}
.lyric-line--active {
  color: var(--md-primary);
  transform: scale(1.20);
}
.lyric-line__main {
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  margin: 0;
}
.lyric-line--active .lyric-line__main {
  font-size: 20px;
  font-weight: 700;
}
.lyric-line__translation {
  font-size: 14px;
  color: var(--md-on-surface-variant);
  opacity: 0.8;
  line-height: 1.4;
  margin: 0;
}
.lyric-line--active .lyric-line__translation {
  color: var(--md-primary);
  opacity: 0.9;
}
</style>
