<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useResizeObserver } from '@vueuse/core'
import { usePlaybackStore } from '../../stores/playback'
import { Icons } from '../../utils/icons'
import IconButton from '../common/IconButton.vue'
import CoverPlaceholder from '../common/CoverPlaceholder.vue'
import QueueDrawer from '../player/QueueDrawer.vue'

const router = useRouter()
// NPB 只关心播放控制状态（currentTrack/isPlaying/currentTime/playMode + 控制动作）
const playback = usePlaybackStore()
const { currentTrack, isPlaying, currentTime, playMode } = storeToRefs(playback)

// 队列抽屉开关 + trigger 元素引用（用于 onClickOutside 忽略）
const queueOpen = ref(false)
const queueTriggerEl = ref<HTMLElement | null>(null)

// NPB 整体宽度（播放条 + gap + 列表按钮），传给 floating 抽屉让其宽度对齐
const npbWrapEl = ref<HTMLElement | null>(null)
const npbWidth = ref(0)
useResizeObserver(npbWrapEl, ([entry]) => {
  npbWidth.value = entry.contentRect.width
})
// 抽屉打开时确保已测量（首次打开可能比 observer 触发更早）
watch(queueOpen, (open) => {
  if (open && npbWrapEl.value && npbWidth.value === 0) {
    npbWidth.value = npbWrapEl.value.offsetWidth
  }
})

// 进度比例 0~1，传给 CSS 变量驱动顶部细线 scaleX
const progress = computed(() => {
  if (!currentTrack.value || currentTrack.value.duration <= 0) return 0
  return Math.min(currentTime.value / currentTrack.value.duration, 1)
})

// 根据播放模式返回图标（三态都为选中态，统一 primary 色）
const playModeIcon = computed(() => {
  switch (playMode.value) {
    case 'one':
      return Icons.repeatOne
    case 'shuffle':
      return Icons.shuffle
    default:
      // all 用 repeat 图标
      return Icons.repeat
  }
})
</script>

<template>
  <!-- 外层容器：横向排列"播放条 + 列表圆按钮"，整体居中 -->
  <Transition name="npb-fade">
    <div
      v-if="currentTrack"
      ref="npbWrapEl"
      class="npb-wrap"
    >
      <!-- 播放条本体 -->
      <div
        class="npb"
        :style="{ '--npb-progress': progress }"
        @click="router.push({ name: 'player' })"
      >
        <!-- 左端圆形封面：48×48，border-radius 24 = 完整圆，占据胶囊左半圆位置 -->
        <CoverPlaceholder
          :title="currentTrack.title"
          :size="48"
          :border-radius="24"
          :cover-url="currentTrack.coverUrl ?? undefined"
          class="npb__cover"
        />

        <!-- 中间文字：titleSmall + bodySmall，truncate 单行 -->
        <div class="npb__text">
          <span class="npb__title">{{ currentTrack.title }}</span>
          <span class="npb__artist">{{ currentTrack.artist?.name ?? '未知' }}</span>
        </div>

        <!-- 右侧控制：repeat + skipPrev + play + skipNext，按钮 @click.stop 防止触发条跳转 -->
        <IconButton
          :icon="playModeIcon"
          :size="24"
          color="var(--md-primary)"
          @click.stop="playback.cyclePlayMode()"
        />
        <IconButton
          :icon="Icons.skipPrev"
          :size="24"
          :disabled="!playback.hasPrev"
          @click.stop="playback.prev()"
        />
        <IconButton
          :icon="isPlaying ? Icons.pause : Icons.play"
          :size="28"
          @click.stop="isPlaying ? playback.pause() : playback.resume()"
        />
        <IconButton
          :icon="Icons.skipNext"
          :size="24"
          :disabled="!playback.hasNext"
          @click.stop="playback.next()"
        />

        <!-- 顶部进度细线：left/right 24 对齐左右两圆上顶点，transform: scaleX 性能更好 -->
        <span class="npb__progress" />
      </div>

      <!-- 右侧独立圆形按钮：外层 48×48 圆形容器（与播放条等高、相同样式）
          作为队列抽屉的 trigger，@click.stop 防止冒泡到 NPB 触发跳转 -->
      <div
        ref="queueTriggerEl"
        class="npb-list"
      >
        <IconButton
          :icon="Icons.list"
          :size="24"
          :selected="queueOpen"
          @click.stop="queueOpen = !queueOpen"
        />
      </div>

      <!-- 队列抽屉：floating variant，悬浮于 NPB 上方，宽度对齐 NPB 整体 -->
      <QueueDrawer
        v-if="queueOpen"
        variant="floating"
        :trigger="queueTriggerEl"
        :width="npbWidth"
        @close="queueOpen = false"
      />
    </div>
  </Transition>
</template>

<style scoped>
/* 外层：横向 flex，整体居中固定底部 */
.npb-wrap {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* BBPlayer 浮动栏规格：高 48、圆角 24、阴影 0 3px 4.65px rgba(0,0,0,0.29)、背景 elevation.level2
   胶囊形：左端 48 圆封面占据左半圆，右端 24 padding 形成空半圆 */
.npb {
  position: relative;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 4px;
  /* padding-right 6 形成右端空半圆；左侧 0 让封面贴左 */
  padding: 0 6px 0 0;
  background: var(--md-surface-container-high);
  border-radius: 24px;
  box-shadow: 0 3px 4.65px rgba(0, 0, 0, 0.29);
  cursor: pointer;
  user-select: none;
  min-width: 400px;
  max-width: 560px;
}

/* 左端圆形封面：flex-shrink 防止被压缩；z-index:1 让进度条在封面之下 */
.npb__cover {
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.npb__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  margin: 0 8px 0 12px;
}
.npb__title {
  font-size: 14px; /* titleSmall */
  font-weight: 500;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.npb__artist {
  font-size: 12px; /* bodySmall */
  color: var(--md-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 顶部进度细线：left/right 24 对齐左右两圆的上顶点，2px 高
   transform-origin: left + scaleX(progress) 比 width 性能更好（不触发 reflow）
   z-index 默认 auto，封面 z-index:1 让进度条在封面之下 */
.npb__progress {
  position: absolute;
  left: 24px;
  right: 24px;
  top: 0;
  height: 2px;
  background: var(--md-primary);
  transform-origin: left;
  transform: scaleX(var(--npb-progress, 0));
  transition: transform 0.3s linear;
  pointer-events: none;
}

/* 右侧独立列表圆按钮：外层 48×48 圆形容器（与播放条等高、相同样式），内含 IconButton
   IconButton 自带 hover state-layer，用 :deep 让它撑满容器使 state-layer 覆盖整个圆 */
.npb-list {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--md-surface-container-high);
  box-shadow: 0 3px 4.65px rgba(0, 0, 0, 0.29);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
/* 让内部 IconButton 撑满 48×48 容器，hover state-layer 覆盖整个圆 */
.npb-list :deep(.md3-icon-btn) {
  width: 100%;
  height: 100%;
}

/* 出现/消失淡入淡出 */
.npb-fade-enter-active,
.npb-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.npb-fade-enter-from,
.npb-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
