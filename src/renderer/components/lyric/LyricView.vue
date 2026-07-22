<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { storeToRefs } from 'pinia'
import { Icon } from '@iconify/vue'
import { useLyricStore } from '../../stores/lyric'
import { usePlaybackStore } from '../../stores/playback'
import { Icons } from '../../utils/icons'
import LyricLineItem from './LyricLineItem.vue'

// 歌词滚动容器：v-for 渲染 LyricLineItem，当前行高亮 + 自动跟随
// 参考 BBPlayer PlayerLyrics.tsx：
// - 活动行对齐到视口顶部 ~35% 处（中间偏上），不是垂直居中
// - 顶/底 60px 用 mask-image 渐变淡出（对应 BBPlayer 的 MaskedView + LinearGradient）
// - 空歌词行直接渲染空字符串，不显示音符占位
// 点击任意行触发 playback.seek(line.time)

const lyricStore = useLyricStore()
const playback = usePlaybackStore()
const { lines, hasTranslation, currentLyricIndex } = storeToRefs(lyricStore)

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

// 当前行变化时自动滚动
watch(currentLyricIndex, async (idx) => {
  if (idx < 0) return
  await nextTick()
  scrollToIndex(idx, true)
})

// 进入页面时立即对齐到当前行（不用 smooth，避免初始大幅滚动动画）
// onMounted 时机确保 ref 函数已执行、DOM 已就绪
onMounted(() => {
  if (currentLyricIndex.value >= 0) {
    scrollToIndex(currentLyricIndex.value, false)
  }
})

// 点击行 → seek 到该行时间戳
function handleSeek(time: number) {
  playback.seek(time)
}
</script>

<template>
  <div class="lyric-view">
    <!-- 有歌词：滚动列表 -->
    <div
      v-if="lines.length > 0"
      ref="scrollRef"
      class="lyric-view__scroll"
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
        @seek="handleSeek"
      />
      <!-- 底部留白：让最后一行也能滚动到容器垂直居中 -->
      <div class="lyric-view__spacer" />
    </div>

    <!-- 无歌词：占位 -->
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
        暂无歌词
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
