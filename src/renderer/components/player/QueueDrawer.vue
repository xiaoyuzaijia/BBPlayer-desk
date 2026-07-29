<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onClickOutside } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import { Icons } from '../../utils/icons'
import IconButton from '../common/IconButton.vue'
import CoverPlaceholder from '../common/CoverPlaceholder.vue'
import { useQueueStore } from '../../stores/queue'
import { usePlayerStore } from '../../stores/player'
import { usePlaybackStore } from '../../stores/playback'

// 播放队列抽屉：参考 BBPlayer 浮动队列
// 两种 variant：
// - floating: 悬浮在 NowPlayingBar 上方，fixed 定位，宽度与 NPB 整体（播放条 + gap + 列表按钮）对齐
// - inline:   悬浮在 PlayerView 控制台上方，absolute 定位，宽度与控制台对齐
interface Props {
  variant?: 'floating' | 'inline'
  // 触发按钮元素：onClickOutside 时忽略，避免与 trigger 自身的 toggle 冲突
  trigger?: HTMLElement | null
  // 抽屉宽度（px）。floating 传入 NPB 整体宽度；inline 传入控制台宽度。
  // 不传则用各自默认值。
  width?: number
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'floating',
  trigger: null,
  width: 0,
})

const emit = defineEmits<{
  close: []
}>()

// 队列数据从 queue store 取，当前索引从 player store 取，播放状态从 playback store 取
const queueStore = useQueueStore()
const player = usePlayerStore()
const playback = usePlaybackStore()
const { queue } = storeToRefs(queueStore)
const { queueIndex } = storeToRefs(player)
const { isPlaying } = storeToRefs(playback)

const rootRef = ref<HTMLElement | null>(null)

// 点击外部关闭（忽略 trigger 自身，避免与 trigger 的 toggle 冲突）
// ignore 接受 MaybeRefOrGetter<(MaybeElementRef | string)[]> —— 整个数组的 getter
onClickOutside(rootRef, () => emit('close'), {
  ignore: () => [props.trigger],
})

// 点击队列项：跳到该曲目（playback store 编排 queue + player）
function playAt(index: number) {
  playback.playQueueIndex(index)
}

// 移除队列项（playback.removeFromQueue 内部编排 queue + player）
function removeAt(index: number) {
  playback.removeFromQueue(index)
}
</script>

<template>
  <!-- floating variant teleport 到 body，避免被祖先 transform 影响定位 -->
  <Teleport
    to="body"
    :disabled="variant !== 'floating'"
  >
    <Transition :name="`queue-${variant}`">
      <div
        ref="rootRef"
        class="queue"
        :class="`queue--${variant}`"
        :style="width ? { width: width + 'px' } : undefined"
      >
        <!-- 头部：标题 + 数量 -->
        <header class="queue__header">
          <span class="queue__title">播放队列</span>
          <span class="queue__count">{{ queue.length }}</span>
        </header>

        <!-- 列表：可滚动 -->
        <ul
          v-if="queue.length > 0"
          class="queue__list"
        >
          <li
            v-for="(track, idx) in queue"
            :key="track.id + '-' + idx"
            class="queue__item"
            :class="{ 'queue__item--current': idx === queueIndex }"
            @click="playAt(idx)"
          >
            <!-- 当前播放指示：均衡器图标 primary 色 -->
            <div class="queue__indicator">
              <Icon
                v-if="idx === queueIndex && isPlaying"
                :icon="Icons.equalizer"
                :width="14"
                :height="14"
                class="queue__eq"
              />
            </div>

            <!-- 40×40 封面 -->
            <CoverPlaceholder
              :title="track.title"
              :size="40"
              :border-radius="8"
              :cover-url="track.coverUrl ?? undefined"
              class="queue__cover"
            />

            <!-- 标题 + 作者 -->
            <div class="queue__text">
              <div class="queue__track-title">
                {{ track.title }}
              </div>
              <div class="queue__track-artist">
                {{ track.artist?.name ?? '未知' }}
              </div>
            </div>

            <!-- 删除按钮 -->
            <IconButton
              :icon="Icons.close"
              :size="16"
              class="queue__remove"
              @click.stop="removeAt(idx)"
            />
          </li>
        </ul>

        <!-- 空状态 -->
        <div
          v-else
          class="queue__empty"
        >
          <Icon
            :icon="Icons.queue"
            :width="32"
            :height="32"
            class="queue__empty-icon"
          />
          <p class="queue__empty-text">
            队列为空
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 抽屉基础样式：圆角 24 + surface-container-high + 阴影，与 NPB 一致 ── */
.queue {
  background: var(--md-surface-container-high);
  border-radius: 24px;
  box-shadow: 0 3px 4.65px rgba(0, 0, 0, 0.29),
              0 8px 12px 6px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 60;
}

/* floating: 固定在视口底部，悬浮于 NPB 之上（NPB bottom 16 + 高 48 + gap 8 = 72）
   宽度由 props.width 传入（NPB 整体宽度），不传则用默认 400 */
.queue--floating {
  position: fixed;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 90vw;
  max-height: 60vh;
}

/* inline: 绝对定位，悬浮于控制台之上
   宽度由 props.width 传入（控制台宽度），不传则用默认 360 */
.queue--inline {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  max-width: 90vw;
  max-height: 50vh;
}

/* ── 头部：高 48，padding 0 16 ── */
.queue__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 48px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--md-outline-variant);
}
.queue__title {
  font-size: 14px; /* titleMedium */
  font-weight: 600;
  color: var(--md-on-surface);
}
.queue__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
  font-size: 12px; /* labelSmall */
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* ── 列表：可滚动 ── */
.queue__list {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* ── 队列项：高 56，padding 8 ── */
.queue__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 20px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.queue__item:hover {
  background: var(--md-surface-container-highest);
}
/* 当前播放高亮：primary 12% 背景 */
.queue__item--current {
  background: color-mix(in srgb, var(--md-primary) 12%, transparent);
}
.queue__item--current:hover {
  background: color-mix(in srgb, var(--md-primary) 16%, transparent);
}

/* 指示器列：固定 14 宽，居中，给当前播放均衡器留位 */
.queue__indicator {
  width: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.queue__eq {
  color: var(--md-primary);
}

.queue__cover {
  flex-shrink: 0;
}

/* 文本列：flex 1，单行省略 */
.queue__text {
  flex: 1;
  min-width: 0;
}
.queue__track-title {
  font-size: 14px; /* titleMedium */
  font-weight: 500;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.queue__item--current .queue__track-title {
  color: var(--md-primary);
}
.queue__track-artist {
  font-size: 12px; /* bodySmall */
  color: var(--md-on-surface-variant);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 删除按钮 */
.queue__remove {
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}
.queue__item:hover .queue__remove {
  opacity: 1;
}

/* ── 空状态 ── */
.queue__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
  gap: 8px;
}
.queue__empty-icon {
  color: var(--md-on-surface-variant);
  opacity: 0.5;
}
.queue__empty-text {
  font-size: 13px;
  color: var(--md-on-surface-variant);
  margin: 0;
}

/* ── 进入/退出动画 ── */
.queue-floating-enter-active,
.queue-floating-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.queue-floating-enter-from,
.queue-floating-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.queue-inline-enter-active,
.queue-inline-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.queue-inline-enter-from,
.queue-inline-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
