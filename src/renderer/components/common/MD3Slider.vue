<script setup lang="ts">
import { computed } from 'vue'

// MD3 滑块 Props
// 用原生 <input type="range"> + CSS 自定义，active track 用 primary，inactive 用 surface-variant
interface Props {
  // v-model 绑定值
  modelValue: number
  // 最大值
  max: number
  // 最小值
  min?: number
  // 步长
  step?: number
  // 禁用态
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  step: 1,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [v: number]
  // 拖动结束（松手）时触发，用于 seek
  change: [v: number]
}>()

function onInput(e: Event) {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value))
}
function onChange(e: Event) {
  emit('change', Number((e.target as HTMLInputElement).value))
}

// 填充百分比，传给 CSS 变量驱动 active track 渐变切分点
const fillPercent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return ((props.modelValue - props.min) / range) * 100
})
</script>

<template>
  <input
    type="range"
    class="md3-slider"
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :style="{ '--md3-slider-fill': fillPercent + '%' }"
    @input="onInput"
    @change="onChange"
  >
</template>

<style scoped>
.md3-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  background: transparent;
  cursor: pointer;
  margin: 0;
  display: block;
}

/* WebKit track：单条 linear-gradient 按 fill% 切分 primary / surface-variant */
.md3-slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--md-primary) 0%,
    var(--md-primary) var(--md3-slider-fill, 0%),
    var(--md-surface-variant) var(--md3-slider-fill, 0%),
    var(--md-surface-variant) 100%
  );
}

/* WebKit thumb：16px 圆形 primary，margin-top 让 thumb 居中于 4px track */
.md3-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--md-primary);
  margin-top: -6px;
  border: none;
  transition: transform 0.1s ease;
}
.md3-slider:not(:disabled)::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

/* Firefox：用原生 ::-moz-range-progress 自动填充 active 段 */
.md3-slider::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: var(--md-surface-variant);
}
.md3-slider::-moz-range-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--md-primary);
}
.md3-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--md-primary);
  border: none;
}

.md3-slider:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
