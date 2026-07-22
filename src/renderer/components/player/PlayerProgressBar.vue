<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatTime } from '../../utils/format'

// 播放器进度条 Props
// 自定义实现：竖条 thumb + track 在 thumb 两侧 mask 挖空（参考 MD3 active slider 视觉）
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

// 填充百分比，传给 CSS 变量驱动 track 渐变切分 + mask 挖空
const fillPercent = computed(() => {
  if (props.duration <= 0) return 0
  return Math.min(100, Math.max(0, (displayPosition.value / props.duration) * 100))
})

// 容器 ref：用于把 clientX 换算成时间
const containerRef = ref<HTMLDivElement | null>(null)
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
      :style="{ '--progress-fill': fillPercent + '%' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <!-- 轨道：linear-gradient 切 primary/surface-variant + mask 在 thumb 位置挖空 -->
      <div class="progress__track" />
      <!-- thumb：垂直胶囊，left=fill%，translateX(-50%) 居中 -->
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

/* ── 容器：24px 高的 hit area，track 与 thumb 都绝对定位居中 ──
   --thumb-half: thumb 半宽，用于 mask 挖空范围计算
   --track-gap: thumb 两侧额外空白宽度 */
.progress__slider {
  position: relative;
  width: 100%;
  height: 24px;
  cursor: pointer;
  --thumb-half: 2px; /* 静止 thumb 4px / 2 */
  --track-gap: 4px;
  touch-action: none; /* 阻止触摸滚动，让 pointer events 接管 */
}
.progress__slider--scrubbing {
  --thumb-half: 1px; /* 拖动 thumb 2px / 2，变细 */
  cursor: grabbing;
}
.progress__slider[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.38;
}

/* ── track：4px 高，水平居中；scrubbing 时变 8px ── */
.progress__track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  border-radius: 2px;
  transform: translateY(-50%);
  background: linear-gradient(
    to right,
    var(--md-primary) 0%,
    var(--md-primary) var(--progress-fill, 0%),
    var(--md-surface-variant) var(--progress-fill, 0%),
    var(--md-surface-variant) 100%
  );
  /* mask：在 thumb 位置挖空一个透明窗口，让 track 视觉上断开成两段
     窗口半宽 = thumb 半宽 + 额外空白 */
  --mask-half: calc(var(--thumb-half) + var(--track-gap));
  -webkit-mask: linear-gradient(
    to right,
    #000 0,
    #000 calc(var(--progress-fill, 0%) - var(--mask-half)),
    transparent calc(var(--progress-fill, 0%) - var(--mask-half)),
    transparent calc(var(--progress-fill, 0%) + var(--mask-half)),
    #000 calc(var(--progress-fill, 0%) + var(--mask-half)),
    #000 100%
  );
  mask: linear-gradient(
    to right,
    #000 0,
    #000 calc(var(--progress-fill, 0%) - var(--mask-half)),
    transparent calc(var(--progress-fill, 0%) - var(--mask-half)),
    transparent calc(var(--progress-fill, 0%) + var(--mask-half)),
    #000 calc(var(--progress-fill, 0%) + var(--mask-half)),
    #000 100%
  );
  transition: height 0.2s ease, border-radius 0.2s ease;
}
.progress__slider--scrubbing .progress__track {
  height: 8px;
  border-radius: 4px;
}

/* ── thumb：垂直胶囊，绝对定位 left=fill%，translate(-50%,-50%) 居中 ──
   静止：4×16 短竖条；scrubbing：2×24 细长竖条（被捏住拉长） */
.progress__thumb {
  position: absolute;
  top: 50%;
  left: var(--progress-fill, 0%);
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: var(--md-primary);
  transform: translate(-50%, -50%);
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
