<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Icons } from '../../utils/icons'
import { formatTime } from '../../utils/format'
import CoverPlaceholder from '../common/CoverPlaceholder.vue'
import IconButton from '../common/IconButton.vue'
import type { Track } from '../../types/track'

// 曲目列表项：参考 BBPlayer PlaylistItem.tsx 简化版
// 布局：[序号/均衡器] [48 封面] [标题/作者] [时长] [⋮ 菜单]
interface Props {
  track: Track
  // 显示序号（1-based）
  index: number
  // 是否为当前播放曲目（用于高亮）
  isCurrent?: boolean
  // 当前曲目是否正在播放（用于显示均衡器图标）
  isPlaying?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isCurrent: false,
  isPlaying: false,
})

defineEmits<{
  // 点击整行（播放该曲目）
  click: []
  // 点击更多按钮
  more: []
}>()
</script>

<template>
  <div
    class="track"
    :class="{ 'track--current': isCurrent }"
    @click="$emit('click')"
  >
    <!-- 序号 / 均衡器（当前播放中显示动态图标） -->
    <div class="track__index">
      <Icon
        v-if="isCurrent && isPlaying"
        :icon="Icons.equalizer"
        :width="16"
        :height="16"
        class="track__eq"
      />
      <span v-else>{{ index }}</span>
    </div>

    <!-- 48×48 封面（CoverPlaceholder 占位） -->
    <CoverPlaceholder
      :title="track.title"
      :size="48"
      :cover-url="track.coverUrl"
      class="track__cover"
    />

    <!-- 标题 + 作者 -->
    <div class="track__text">
      <div class="track__title">{{ track.title }}</div>
      <div class="track__subtitle">{{ track.artist }}</div>
    </div>

    <!-- 时长 -->
    <div class="track__duration">{{ formatTime(track.duration) }}</div>

    <!-- 更多按钮（点击时阻止冒泡，避免触发整行 click） -->
    <IconButton :icon="Icons.more" :size="20" @click.stop="$emit('more')" />
  </div>
</template>

<style scoped>
/* 行容器：64 高，hover/active 高亮，底部 Divider 分隔 */
.track {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 0;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-bottom: 1px solid var(--md-outline-variant);
}
.track:hover {
  background: var(--md-surface-container);
}
/* 当前播放高亮：12% primary 背景 */
.track--current {
  background: color-mix(in srgb, var(--md-primary) 12%, transparent);
}
.track--current:hover {
  background: color-mix(in srgb, var(--md-primary) 16%, transparent);
}

/* 序号列：固定 32 宽，居中，bodyMedium */
.track__index {
  width: 32px;
  flex-shrink: 0;
  text-align: center;
  font-size: 14px;
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
/* 均衡器图标：primary 色 */
.track__eq {
  color: var(--md-primary);
}

.track__cover {
  flex-shrink: 0;
}

/* 文本列：flex 1，单行省略 */
.track__text {
  flex: 1;
  min-width: 0;
}
.track__title {
  font-size: 14px; /* titleMedium */
  font-weight: 500;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track--current .track__title {
  color: var(--md-primary);
}
.track__subtitle {
  font-size: 12px; /* bodySmall */
  color: var(--md-on-surface-variant);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 时长：tabular-nums 保证数字对齐 */
.track__duration {
  font-size: 12px;
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
