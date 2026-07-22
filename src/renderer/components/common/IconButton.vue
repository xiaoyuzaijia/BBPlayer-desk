<script setup lang="ts">
import { Icon } from '@iconify/vue'

// MD3 图标按钮 Props
// 参考 BBPlayer IconButton.tsx：默认 size=24，padding=8，按钮外径 = size + 16
interface Props {
  // Iconify 图标名，如 'material-symbols:play-arrow-rounded'
  icon: string
  // 图标尺寸（px）
  size?: number
  // 自定义图标颜色，默认跟随 on-surface-variant
  color?: string
  // 选中态：图标变 primary 色
  selected?: boolean
  // 禁用态
  disabled?: boolean
  // 原生 button type
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
  color: undefined,
  selected: false,
  disabled: false,
  type: 'button',
})

defineEmits<{
  click: [e: MouseEvent]
}>()
</script>

<template>
  <button
    :type="props.type"
    :disabled="disabled"
    class="md3-icon-btn"
    :class="{
      'md3-icon-btn--selected': selected,
      'md3-icon-btn--disabled': disabled,
    }"
    :style="color ? { color } : undefined"
    @click="$emit('click', $event)"
  >
    <Icon
      :icon="icon"
      :width="size"
      :height="size"
    />
  </button>
</template>

<style scoped>
/* 容器：圆形、无边框、padding 8（按钮外径 = size + 16） */
.md3-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: var(--md-on-surface-variant);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}

/* state-layer：hover 8% / active 12%
   color-mix 用 currentColor 自动跟随图标色，等效 BBPlayer 的 `${iconColor}1F` */
.md3-icon-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.md3-icon-btn:active:not(:disabled) {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

/* 选中态：图标变 primary */
.md3-icon-btn--selected {
  color: var(--md-primary);
}

/* 禁用态：opacity 0.38（MD3 规范） */
.md3-icon-btn--disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
