<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Icons } from '../../utils/icons'
import type { Track } from '../../types/track'
import TrackListItem from './TrackListItem.vue'

// 曲目列表容器
// - 桌面端独有表头行（# / 标题 / 时长 / 操作）
// - v-for 渲染 TrackListItem
// - 空态：还没有歌曲
interface Props {
  tracks: Track[]
  // 当前播放曲目 id（用于高亮）
  currentTrackId?: string
  // 当前是否正在播放
  isPlaying?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  currentTrackId: '',
  isPlaying: false,
})

defineEmits<{
  // 点击曲目行
  clickTrack: [track: Track]
  // 点击更多按钮
  moreTrack: [track: Track]
}>()
</script>

<template>
  <div class="track-list">
    <!-- 表头行：桌面端独有，对应 TrackListItem 的列布局 -->
    <div v-if="tracks.length > 0" class="track-list__header">
      <div class="track-list__index-col">#</div>
      <div class="track-list__cover-col"></div>
      <div class="track-list__title-col">标题</div>
      <div class="track-list__duration-col">时长</div>
      <!-- 与 IconButton 等宽（20 + 16 padding） -->
      <div class="track-list__action-col"></div>
    </div>

    <!-- 曲目列表 -->
    <div v-if="tracks.length > 0" class="track-list__body">
      <TrackListItem
        v-for="(track, idx) in tracks"
        :key="track.id"
        :track="track"
        :index="idx + 1"
        :is-current="track.id === currentTrackId"
        :is-playing="isPlaying && track.id === currentTrackId"
        @click="$emit('clickTrack', track)"
        @more="$emit('moreTrack', track)"
      />
    </div>

    <!-- 空态 -->
    <div v-else class="track-list__empty">
      <Icon :icon="Icons.musicNote" :width="48" :height="48" class="track-list__empty-icon" />
      <p class="track-list__empty-text">还没有歌曲</p>
    </div>
  </div>
</template>

<style scoped>
.track-list {
  width: 100%;
}

/* 表头：与 TrackListItem 列对齐 */
.track-list__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 0;
  border-bottom: 1px solid var(--md-outline-variant);
  font-size: 12px;
  font-weight: 500;
  color: var(--md-on-surface-variant);
}
.track-list__index-col {
  width: 32px;
  text-align: center;
  flex-shrink: 0;
}
.track-list__cover-col {
  width: 48px;
  flex-shrink: 0;
}
.track-list__title-col {
  flex: 1;
  min-width: 0;
}
.track-list__duration-col {
  flex-shrink: 0;
}
/* 与 IconButton 外径对齐（20 + 16 = 36） */
.track-list__action-col {
  width: 36px;
  flex-shrink: 0;
}

/* 空态 */
.track-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  gap: 12px;
}
.track-list__empty-icon {
  color: var(--md-on-surface-variant);
  opacity: 0.5;
}
.track-list__empty-text {
  font-size: 14px;
  color: var(--md-on-surface-variant);
}
</style>
