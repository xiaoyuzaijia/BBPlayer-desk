<script setup lang="ts">
// MD3 开关
// 关态：36×16 椭圆，outline 边，8px thumb 居左
// 开态：52×32 椭圆，primary 填充，24px thumb 居右
// 参考 BBPlayer UniversalSwitch.tsx + MD3 规范

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
    <span class="md3-switch__thumb"></span>
  </button>
</template>

<style scoped>
.md3-switch {
  position: relative;
  /* 关态尺寸：36×16 */
  width: 36px;
  height: 16px;
  border: 2px solid var(--md-outline);
  background: var(--md-surface-variant);
  border-radius: 9999px;
  padding: 0;
  cursor: pointer;
  transition: width 0.2s ease, height 0.2s ease,
    background-color 0.2s ease, border-color 0.2s ease;
  flex-shrink: 0;
  box-sizing: border-box;
}

/* 开态：52×32，primary 填充 */
.md3-switch--on {
  width: 52px;
  height: 32px;
  border-color: var(--md-primary);
  background: var(--md-primary);
}

/* thumb：绝对定位居中，用 translate 控制左右 */
.md3-switch__thumb {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: var(--md-outline);
  border-radius: 50%;
  /* 关态：thumb 中心向左偏移 10 → 左边距 = 18 - 10 - 4 = 4 */
  transform: translate(-50%, -50%) translateX(-10px);
  transition: width 0.2s ease, height 0.2s ease,
    background-color 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

/* 开态：thumb 变 24px + 向右偏移 10 → 右边距 = 52 - 36 - 12 = 4 */
.md3-switch--on .md3-switch__thumb {
  width: 24px;
  height: 24px;
  background: var(--md-on-primary);
  transform: translate(-50%, -50%) translateX(10px);
}

.md3-switch:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
