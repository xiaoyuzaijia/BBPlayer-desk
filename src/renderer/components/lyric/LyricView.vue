<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { storeToRefs } from 'pinia'
import { Icon } from '@iconify/vue'
import { useLyricStore } from '../../stores/lyric'
import { usePlaybackStore } from '../../stores/playback'
import { useLyricSync } from '../../composables/useLyricSync'
import { Icons } from '../../utils/icons'
import LyricLineItem from './LyricLineItem.vue'

// 歌词滚动容器：v-for 渲染 LyricLineItem，当前行高亮 + 自动跟随
// 参考 BBPlayer PlayerLyrics.tsx：
// - 活动行对齐到视口顶部 ~35% 处（中间偏上），不是垂直居中
// - 顶/底用 mask-image 渐变淡出（对应 BBPlayer 的 MaskedView + LinearGradient）
// - 点击任意行触发 handleJumpToLyric（防并发 seek + 立即滚动）
// - 手动滚动 2s 防抖回弹（useLyricSync）
//
// 与 BBPlayer 的差异：
// - BBPlayer 用 Reanimated SharedValue + useAnimatedReaction 在 UI 线程滚动
// - 本项目用 Vue watch + DOM scrollTo（主线程），60fps 平滑度略低但够用
// - BBPlayer 行索引由 useLyricSync 内部维护（2Hz 原生事件驱动）
//   本项目行索引来自 lyric store computed（消费 playback.smoothCurrentTime 60fps 插值）

const lyricStore = useLyricStore()
const playback = usePlaybackStore()
const { lines, hasTranslation, currentLyricIndex, isLoading, errorMessage } =
  storeToRefs(lyricStore)

// 滚动容器引用
const scrollRef = ref<HTMLElement | null>(null)
// 每行 DOM 引用数组（用于计算自动滚动目标位置）
const lineRefs = ref<(HTMLElement | null)[]>([])

// Vue 3 函数式 ref：对子组件用 :ref 函数时，el 是组件实例（不是 DOM）
// 需要从 $el 拿到根 DOM 元素
function setLineRef(el: Element | ComponentPublicInstance | null, idx: number) {
  if (!el) {
    lineRefs.value[idx] = null
    return
  }
  // 子组件实例的 $el 是其根 DOM；普通元素的 $el 是 undefined，直接用 el
  const dom = (el as ComponentPublicInstance).$el ?? (el as HTMLElement)
  lineRefs.value[idx] = dom as HTMLElement
}

// 滚动到指定行：活动行对齐到视口顶部 35% 处（中间偏上）
// 参考 BBPlayer: y - windowHeight * 0.15（视口顶部 15%）；桌面端容器较小，用 35% 更合适
function scrollToIndex(idx: number, smooth: boolean) {
  if (idx < 0) return
  const container = scrollRef.value
  const target = lineRefs.value[idx]
  if (!container || !target) return
  // offsetTop 相对 offsetParent（即滚动容器内容区）
  // 让目标行的顶部位于视口的 35% 处
  const targetTop = target.offsetTop - container.clientHeight * 0.35
  container.scrollTo({ top: Math.max(0, targetTop), behavior: smooth ? 'smooth' : 'auto' })
}

// 歌词同步逻辑（手动滚动防抖 + 点击跳转防并发）
const { onUserScrollStart, onUserScrollEnd, handleJumpToLyric } = useLyricSync({
  lines: () => lines.value,
  currentLyricIndex: () => currentLyricIndex.value,
  scrollToIndex,
  seekTo: (t) => playback.seek(t),
})

// 用户手动滚动检测：wheel 事件（鼠标滚轮）+ pointerdown（触摸/鼠标拖拽滚动）
// BBPlayer 用 ScrollView 的 onBeginDrag/onEndDrag；Vue 用 wheel + pointer 事件模拟
// wheel：开始滚动时标记，停止滚动后启动 2s 防抖（pointerup 触发结束）
function onWheel() {
  onUserScrollStart()
  // wheel 没有"结束"事件，用防抖模式：每次 wheel 都重置定时器
  // 这里复用 onUserScrollEnd 的语义（它内部会先 clear 再 set 2s 定时器）
  onUserScrollEnd()
}

// 拖拽滚动：pointerdown 开始，pointerup 结束
function onPointerDown() {
  onUserScrollStart()
}

function onPointerUp() {
  onUserScrollEnd()
}

// 进入页面时立即对齐到当前行（不用 smooth，避免初始大幅滚动动画）
// onMounted 时机确保 ref 函数已执行、DOM 已就绪
onMounted(() => {
  if (currentLyricIndex.value >= 0) {
    scrollToIndex(currentLyricIndex.value, false)
  }
})

// 切歌时（lines 变化）重置到第一行或当前行
// nextTick 等待新 DOM 渲染完成
watch(lines, async () => {
  await nextTick()
  if (currentLyricIndex.value >= 0) {
    scrollToIndex(currentLyricIndex.value, false)
  }
})

// 状态文案：loading / error / 无歌词
const statusText = computed(() => {
  if (isLoading.value) return '歌词加载中…'
  if (errorMessage.value) return errorMessage.value
  return '暂无歌词'
})

// 是否显示空态（loading / error / 无歌词）
const showEmpty = computed(
  () => lines.value.length === 0,
)
</script>

<template>
  <div class="lyric-view">
    <!-- 有歌词：滚动列表 -->
    <div
      v-if="!showEmpty"
      ref="scrollRef"
      class="lyric-view__scroll"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <!-- 顶部留白：让第一行也能滚动到容器垂直居中 -->
      <div class="lyric-view__spacer" />
      <LyricLineItem
        v-for="(line, idx) in lines"
        :key="idx"
        :ref="(el) => setLineRef(el as Element | null, idx)"
        :line="line"
        :active="idx === currentLyricIndex"
        :has-translation="hasTranslation"
        @seek="handleJumpToLyric(idx)"
      />
      <!-- 底部留白：让最后一行也能滚动到容器垂直居中 -->
      <div class="lyric-view__spacer" />
    </div>

    <!-- 空态：loading / error / 无歌词 -->
    <div
      v-else
      class="lyric-view__empty"
    >
      <Icon
        :icon="Icons.lyrics"
        :width="64"
        :height="64"
        class="lyric-view__empty-icon"
      />
      <p class="lyric-view__empty-text">
        {{ statusText }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.lyric-view {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lyric-view__scroll {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
  /* 隐藏滚动条但保留滚动功能（移动端 + 桌面端 webkit） */
  scrollbar-width: none;
  /* 顶/底渐变淡出
     --lyric-mask-top: 顶部遮罩高度
     --lyric-mask-bottom: 底部遮罩高度
     mask-image 用 alpha 决定内容可见度：black 完全可见，transparent 隐藏 */
  --lyric-mask-top: 80px;
  --lyric-mask-bottom: 240px;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black var(--lyric-mask-top),
    black calc(100% - var(--lyric-mask-bottom)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    black var(--lyric-mask-top),
    black calc(100% - var(--lyric-mask-bottom)),
    transparent 100%
  );
}
.lyric-view__scroll::-webkit-scrollbar {
  display: none;
}
/* 顶部留白：让第一行也能滚动到视口 35% 位置（活动行偏上对齐）
   底部留白：让最后一行也能上滚到 35% 位置 */
.lyric-view__spacer {
  height: 35%;
  flex-shrink: 0;
}
.lyric-view__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--md-on-surface-variant);
}
.lyric-view__empty-icon {
  opacity: 0.4;
}
.lyric-view__empty-text {
  font-size: 14px;
  margin: 0;
}
</style>
