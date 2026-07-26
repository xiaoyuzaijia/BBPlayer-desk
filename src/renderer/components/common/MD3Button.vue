<script setup lang="ts">
import { Icon } from '@iconify/vue'

// MD3 通用按钮
// 三种 variant：filled（实心主按钮）/ outlined（描边次按钮）/ danger（危险动作）
// icon 直接传 Iconify 图标名（Icons.xxx 的值），与 IconButton 用法一致
type Variant = 'filled' | 'outlined' | 'danger'

interface Props {
  variant?: Variant
  icon?: string
  iconSize?: number
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'filled',
  icon: undefined,
  iconSize: 18,
  disabled: false,
  title: undefined,
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
    :title="title"
    class="md3-btn"
    :class="`md3-btn--${variant}`"
    @click="$emit('click', $event)"
  >
    <Icon
      v-if="icon"
      :icon="icon"
      :width="iconSize"
      :height="iconSize"
    />
    <slot />
  </button>
</template>

<style scoped>
/* ── 按钮基类（MD3 规范：高 40、圆角 9999、padding 0 24）── */
.md3-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 24px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
  border: none;
  background: transparent;
}
.md3-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* ── filled：实心，primary 底色 ── */
.md3-btn--filled {
  background: var(--md-primary);
  color: var(--md-on-primary);
}
.md3-btn--filled:hover:not(:disabled) {
  box-shadow: var(--md-elevation-shadow-level1);
}

/* ── outlined：描边，透明底 ── */
.md3-btn--outlined {
  background: transparent;
  color: var(--md-primary);
  border: 1px solid var(--md-outline);
}
.md3-btn--outlined:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
}

/* ── danger：危险动作，error 色描边（基于 outlined，改色）── */
.md3-btn--danger {
  background: transparent;
  color: var(--md-error);
  border: 1px solid var(--md-error);
}
.md3-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-error) 8%, transparent);
}
</style>
