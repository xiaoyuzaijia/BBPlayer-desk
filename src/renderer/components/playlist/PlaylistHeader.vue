<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Icons } from '../../utils/icons'
import CoverPlaceholder from '../common/CoverPlaceholder.vue'
import IconButton from '../common/IconButton.vue'
import type { Playlist } from '../../types/playlist'
import { totalDuration } from '../../stores/playlist'

// 歌单详情页头部：参考 BBPlayer PlaylistHeader.tsx 简化版
// 布局：[120 封面] [标题 / N首•总时长 / 描述]
//      [播放全部] [同步] [+ 添加歌曲] [⋯ 更多]
interface Props {
  playlist: Playlist
}

const props = defineProps<Props>()

defineEmits<{
  // 播放全部
  playAll: []
  // 同步（仅 synced/favorite/toview 显示）
  sync: []
  // 添加歌曲（仅 local 显示）
  addTrack: []
  // 更多操作
  more: []
}>()

// 曲目数
const trackCount = computed(() => props.playlist.tracks.length)
// 总时长（秒）：用独立工具函数（非 store 方法）
const totalDurationSec = computed(() => totalDuration(props.playlist.tracks))
// 总时长格式化（hh:mm:ss 或 mm:ss）
const totalDurationText = computed(() => {
  const sec = totalDurationSec.value
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
})

// 按歌单类型决定按钮显隐
// - local:   显示 +添加歌曲，不显示 同步
// - synced:  显示 同步，不显示 +添加歌曲
// - favorite: 显示 同步，不显示 +添加歌曲
// - toview:  显示 同步，不显示 +添加歌曲
const showSync = computed(() => props.playlist.type !== 'local')
const showAddTrack = computed(() => props.playlist.type === 'local')

// 同步按钮的文案：synced 显示"重新同步"，其他显示"同步"
const syncLabel = computed(() =>
  props.playlist.type === 'synced' ? '重新同步' : '同步到本地',
)
</script>

<template>
  <header class="header">
    <!-- 上半部分：封面 + 信息 -->
    <div class="header__main">
      <!-- 120×120 大封面 -->
      <CoverPlaceholder
        :title="playlist.title"
        :size="120"
        :cover-url="playlist.coverUrl"
        class="header__cover"
      />

      <!-- 标题 + 元信息 + 描述 -->
      <div class="header__info">
        <h1 class="header__title">
          {{ playlist.title }}
        </h1>
        <div class="header__meta">
          <!-- 类型徽章（小标签） -->
          <span class="header__type-badge">{{ {
            local: '本地',
            synced: '已同步',
            favorite: 'B站收藏',
            toview: '稍后再看',
          }[playlist.type] }}</span>
          <span>{{ trackCount }} 首</span>
          <span class="header__dot">·</span>
          <span>总时长 {{ totalDurationText }}</span>
        </div>
        <p
          v-if="playlist.description"
          class="header__desc"
        >
          {{ playlist.description }}
        </p>
      </div>
    </div>

    <!-- 下半部分：操作按钮行 -->
    <div class="header__actions">
      <!-- 播放全部：FilledButton（primary 背景） -->
      <button
        class="btn btn--filled"
        @click="$emit('playAll')"
      >
        <Icon
          :icon="Icons.play"
          :width="20"
          :height="20"
        />
        <span>播放全部</span>
      </button>

      <!-- 同步：OutlinedButton（仅 synced/favorite/toview 显示） -->
      <button
        v-if="showSync"
        class="btn btn--outlined"
        @click="$emit('sync')"
      >
        <Icon
          :icon="Icons.cloud"
          :width="20"
          :height="20"
        />
        <span>{{ syncLabel }}</span>
      </button>

      <!-- 添加歌曲：OutlinedButton（仅 local 显示） -->
      <button
        v-if="showAddTrack"
        class="btn btn--outlined"
        @click="$emit('addTrack')"
      >
        <Icon
          :icon="Icons.add"
          :width="20"
          :height="20"
        />
        <span>添加歌曲</span>
      </button>

      <!-- 更多：IconButton -->
      <IconButton
        :icon="Icons.more"
        :size="20"
        @click="$emit('more')"
      />
    </div>
  </header>
</template>

<style scoped>
.header {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 上半：封面 + 信息 */
.header__main {
  display: flex;
  gap: 24px;
  align-items: flex-end;
}
.header__cover {
  flex-shrink: 0;
}
.header__info {
  flex: 1;
  min-width: 0;
  padding-bottom: 8px;
}
.header__title {
  font-size: 28px; /* headlineSmall */
  font-weight: 700;
  color: var(--md-on-surface);
  margin: 0 0 12px 0;
  line-height: 1.2;
  word-break: break-word;
}
.header__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px; /* bodyMedium */
  color: var(--md-on-surface-variant);
  margin-bottom: 8px;
}
.header__dot {
  opacity: 0.6;
}
/* 类型徽章：小圆角胶囊 */
.header__type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 9999px;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
  font-size: 12px;
  font-weight: 500;
}
.header__desc {
  font-size: 14px; /* bodyMedium */
  color: var(--md-on-surface-variant);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 操作按钮行 */
.header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* MD3 按钮基础样式 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  height: 40px;
  border-radius: 9999px;
  font-size: 14px; /* labelLarge */
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
  border: none;
}

/* FilledButton：primary 背景填充 */
.btn--filled {
  background: var(--md-primary);
  color: var(--md-on-primary);
}
.btn--filled:hover {
  box-shadow: var(--md-elevation-shadow-level1);
  background: color-mix(in srgb, var(--md-on-primary) 8%, var(--md-primary));
}

/* OutlinedButton：透明背景 + outline 边框 */
.btn--outlined {
  background: transparent;
  color: var(--md-primary);
  border: 1px solid var(--md-outline);
}
.btn--outlined:hover {
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}
</style>
