<script setup lang="ts">
import { computed, ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { formatTime } from '../../utils/format'

// 播放器进度条：竖条 thumb + 双段 track（clip-path 裁剪）
interface Props {
  // 当前播放时间（来自 store，正常播放时由外部驱动）
  current: number
  // 总时长
  duration: number
  // 禁用态
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  // 松手或键盘改变时触发，外部调 store.seek
  seek: [time: number]
}>()

// ── 状态机：拖动预览与实际 seek 分离 ──
// isScrubbing=true 期间，UI 显示 scrubPosition（跟手），不触发 seek
// 松手才 emit('seek')，避免拖动中每帧都写 store
const isScrubbing = ref(false)
const scrubPosition = ref(0)

// 显示位置：拖动时用 scrubPosition，否则用 props.current
const displayPosition = computed(() =>
  isScrubbing.value ? scrubPosition.value : props.current,
)

// 容器宽度（像素），ResizeObserver 观测；首次可能为 0
const containerRef = ref<HTMLDivElement | null>(null)
const containerWidth = ref(0)
useResizeObserver(containerRef, ([entry]) => {
  containerWidth.value = entry.contentRect.width
})

// thumb / track 共用像素值：displayPosition → 容器内 x 坐标
const fillPx = computed(() => {
  if (props.duration <= 0 || containerWidth.value === 0) return 0
  return Math.min(
    containerWidth.value,
    Math.max(0, (displayPosition.value / props.duration) * containerWidth.value),
  )
})

// track 双段 clip 裁剪值（px），用 clip-path 替代 scaleX，保留 border-radius 不形变
// gap = thumb 半宽 + 留空：静止 6px / 拖动 5px
// filled：从右侧裁掉 (containerWidth - fillPx + gap)，只露出左侧填充部分
// remaining：从左侧裁掉 (fillPx + gap)，只露出右侧剩余部分
const filledClipRight = computed(() => {
  if (containerWidth.value <= 0) return 0
  const gap = isScrubbing.value ? 5 : 6
  return Math.max(0, containerWidth.value - fillPx.value + gap)
})
const remainClipLeft = computed(() => {
  if (containerWidth.value <= 0) return 0
  const gap = isScrubbing.value ? 5 : 6
  return Math.max(0, fillPx.value + gap)
})
function clientXToTime(clientX: number): number {
  const el = containerRef.value
  if (!el || props.duration <= 0) return 0
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return ratio * props.duration
}

// 是否可交互
const interactive = computed(() => !props.disabled && props.duration > 0)

// pointer 拖动：down 即跳转到点击位置并开始 scrubbing，move 跟手，up 触发 seek
function onPointerDown(e: PointerEvent) {
  if (!interactive.value) return
  isScrubbing.value = true
  scrubPosition.value = clientXToTime(e.clientX)
  // 捕获 pointer：move/up 即使移出容器也能收到
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  navigator.vibrate?.(10)
}
function onPointerMove(e: PointerEvent) {
  if (!isScrubbing.value) return
  scrubPosition.value = clientXToTime(e.clientX)
}
function onPointerUp(e: PointerEvent) {
  if (!isScrubbing.value) return
  const v = clientXToTime(e.clientX)
  // 先 emit 再清 scrubbing：emit 同步触发 store.seek → props.current 更新到 v
  // 然后 scrubbing=false 切换到 current，无中间跳变帧
  emit('seek', v)
  isScrubbing.value = false
  navigator.vibrate?.(10)
}

// 键盘：←→ ±5s，Home/End 跳首尾
function onKeydown(e: KeyboardEvent) {
  if (!interactive.value) return
  let next: number | null = null
  switch (e.key) {
    case 'ArrowLeft':
      next = displayPosition.value - 5
      break
    case 'ArrowRight':
      next = displayPosition.value + 5
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = props.duration
      break
  }
  if (next === null) return
  e.preventDefault()
  emit('seek', Math.min(props.duration, Math.max(0, next)))
}
</script>

<template>
  <div class="progress">
    <div
      ref="containerRef"
      class="progress__slider"
      :class="{ 'progress__slider--scrubbing': isScrubbing }"
      role="slider"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(duration)"
      :aria-valuenow="Math.round(displayPosition)"
      :aria-disabled="!interactive"
      :tabindex="interactive ? 0 : -1"
      :style="{
        '--progress-fill-px': fillPx + 'px',
        '--progress-filled-clip-right': filledClipRight + 'px',
        '--progress-remain-clip-left': remainClipLeft + 'px',
      }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <!-- filled / remaining 双段轨道 -->
      <div class="progress__track-filled" />
      <div class="progress__track-remaining" />
      <!-- thumb -->
      <div class="progress__thumb" />
    </div>
    <div class="progress__time">
      <span>{{ formatTime(displayPosition) }}</span>
      <span>{{ formatTime(duration) }}</span>
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── 容器：24px 高 hit area ── */
.progress__slider {
  position: relative;
  width: 100%;
  height: 24px;
  cursor: pointer;
  touch-action: none; /* 阻止触摸滚动，让 pointer events 接管 */
}
.progress__slider--scrubbing {
  cursor: grabbing;
}
.progress__slider[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.38;
}

/* ── track 双段：width:100% + clip-path:inset() 裁剪可见区域
   filled 从左裁右，remaining 从右裁左，与 thumb 共享 fillPx。
   clip-path 不改变元素渲染，border-radius 始终保持 2px 无形变。 */
.progress__track-filled,
.progress__track-remaining {
  position: absolute;
  top: 50%;
  height: 4px;
  border-radius: 2px;
  transform: translateY(-50%);
  transition: height 0.2s ease, border-radius 0.2s ease;
}
.progress__track-filled {
  left: 0;
  width: 100%;
  background: var(--md-primary);
  clip-path: inset(0 var(--progress-filled-clip-right, 0px) 0 0);
}
.progress__track-remaining {
  right: 0;
  width: 100%;
  background: var(--md-surface-variant);
  clip-path: inset(0 0 0 var(--progress-remain-clip-left, 0px));
}
.progress__slider--scrubbing .progress__track-filled,
.progress__slider--scrubbing .progress__track-remaining {
  height: 8px;
  border-radius: 4px;
}

/* ── thumb：垂直胶囊，compositor 定位 ── */
.progress__thumb {
  position: absolute;
  top: 50%;
  left: 0;
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: var(--md-primary);
  transform: translateX(calc(var(--progress-fill-px, 0px) - 50%)) translateY(-50%);
  transition: width 0.15s ease, height 0.15s ease, border-radius 0.15s ease;
}
.progress__slider--scrubbing .progress__thumb {
  width: 2px;
  height: 24px;
  border-radius: 1px;
}

/* ── 时间标签：tabular-nums 防数字宽度抖动 ── */
.progress__time {
  display: flex;
  justify-content: space-between;
  font-size: 12px; /* bodySmall */
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
</style>
