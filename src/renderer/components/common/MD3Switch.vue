<script setup lang="ts">
// MD3 开关
// 固定尺寸版（MD3 规范）：track 始终 52×32，避免开关态尺寸跳变
// - 关态：outline 边 + surface-variant 背景，12×12 thumb 居左
// - 开态：primary 填充，24×24 thumb 居右

interface Props {
  // v-model 绑定值
  modelValue: boolean
  // 禁用态
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
}>()

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    class="md3-switch"
    :class="{ 'md3-switch--on': modelValue }"
    @click="toggle"
  >
    <span class="md3-switch__thumb" />
  </button>
</template>

<style scoped>
.md3-switch {
  position: relative;
  /* 固定尺寸：始终 52×32，避免开关态尺寸跳变 */
  width: 52px;
  height: 32px;
  border: 2px solid var(--md-outline);
  background: var(--md-surface-variant);
  border-radius: 9999px;
  padding: 0;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
  box-sizing: border-box;
}

/* 开态：仅改颜色，尺寸不变 */
.md3-switch--on {
  border-color: var(--md-primary);
  background: var(--md-primary);
}

/* thumb：绝对定位居中，用 translate 控制左右 */
.md3-switch__thumb {
  position: absolute;
  top: 50%;
  left: 50%;
  /* 关态：12×12 thumb，距左 outline 内侧 2px（视觉间距） */
  width: 12px;
  height: 12px;
  background: var(--md-outline);
  border-radius: 50%;
  /* track 中心 26px → thumb 中心 10px（左移 16px） */
  transform: translate(-50%, -50%) translateX(-12px);
  transition: width 0.2s ease, height 0.2s ease,
    background-color 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

/* 开态：24×24 thumb，距右 outline 内侧 2px */
.md3-switch--on .md3-switch__thumb {
  width: 24px;
  height: 24px;
  background: var(--md-on-primary);
  /* track 中心 26px → thumb 中心 36px（右移 10px） */
  transform: translate(-50%, -50%) translateX(10px);
}

.md3-switch:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
