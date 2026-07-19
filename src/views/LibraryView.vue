<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Icons } from '../utils/icons'
import CoverPlaceholder from '../components/common/CoverPlaceholder.vue'
import { usePlaylistStore } from '../stores/playlist'
import type { Playlist } from '../types/playlist'

const router = useRouter()
const playlistStore = usePlaylistStore()

// 三个 tab：本地歌单 / B站收藏 / 稍后再看
// 本地 tab 同时展示 local + synced 两种类型
const tabs = [
  { key: 'local', label: '本地歌单' },
  { key: 'bilibili', label: 'B站收藏' },
  { key: 'watchlater', label: '稍后再看' },
] as const

const activeTab = ref<(typeof tabs)[number]['key']>('local')

// 按 tab 取歌单列表
const list = computed<Playlist[]>(() => {
  if (activeTab.value === 'local') {
    // 本地 tab 同时显示 local + synced
    return playlistStore.playlists.filter(
      (p) => p.type === 'local' || p.type === 'synced',
    )
  }
  if (activeTab.value === 'bilibili') {
    return playlistStore.getPlaylistsByType('favorite')
  }
  // 稍后再看
  return playlistStore.getPlaylistsByType('toview')
})

// 根据 playlist.type 与 isPinned 决定状态图标
function statusIcon(playlist: Playlist): string | null {
  if (playlist.isPinned) return Icons.pin
  if (playlist.type === 'synced') return Icons.cloud
  if (playlist.type === 'favorite' || playlist.type === 'toview') return Icons.cloud
  return null
}

// 列表项点击：按 type 跳转对应路由
function goToPlaylist(playlist: Playlist) {
  if (playlist.type === 'toview') {
    router.push({ name: 'playlist-toview' })
  } else if (playlist.type === 'favorite') {
    router.push({ name: 'playlist-favorite', params: { id: playlist.id } })
  } else {
    // local + synced 都走 playlist-local 路由
    router.push({ name: 'playlist-local', params: { id: playlist.id } })
  }
}
</script>

<template>
  <div class="library">
    <h2 class="library__title">
      音乐库
    </h2>

    <!-- Tab 栏：底部 2px 横线作为 MD3 指示器 -->
    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ 'tab--active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- 列表：封面 + 标题/副标题 + 末尾箭头，Divider 分隔 -->
    <div
      v-if="list.length > 0"
      class="list"
    >
      <div
        v-for="(item, idx) in list"
        :key="item.id"
        class="list-item"
        :class="{ 'list-item--last': idx === list.length - 1 }"
        @click="goToPlaylist(item)"
      >
        <!-- 48×48 CoverPlaceholder（coverUrl 留空走占位符） -->
        <CoverPlaceholder
          :title="item.title"
          :size="48"
          :cover-url="item.coverUrl"
          class="list-item__cover"
        />
        <!-- 标题 + 副标题（含状态图标） -->
        <div class="list-item__text">
          <div class="list-item__title">
            {{ item.title }}
          </div>
          <div class="list-item__subtitle">
            <Icon
              v-if="statusIcon(item)"
              :icon="statusIcon(item)!"
              :width="13"
              :height="13"
              class="list-item__status-icon"
            />
            <span>{{ item.tracks.length }} 首</span>
          </div>
        </div>
        <!-- 末尾右箭头 -->
        <Icon
          :icon="Icons.chevronRight"
          :width="24"
          :height="24"
          class="list-item__chevron"
        />
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-else
      class="empty"
    >
      <Icon
        :icon="Icons.library"
        :width="48"
        :height="48"
        class="empty__icon"
      />
      <p class="empty__text">
        暂无内容
      </p>
    </div>
  </div>
</template>

<style scoped>
/* ── 页面根容器 ── */
.library {
  padding: 24px;
}
.library__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--md-on-surface);
  margin-bottom: 24px;
}

/* ── Tab 栏 ── */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  /* 底部 1px 分隔线 */
  border-bottom: 1px solid var(--md-outline-variant);
}
.tab {
  position: relative;
  padding: 0 16px;
  height: 48px;
  font-size: 14px;
  font-weight: 500;
  color: var(--md-on-surface-variant);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease;
}
.tab:hover {
  background: var(--md-surface-container);
}
.tab--active {
  color: var(--md-primary);
  font-weight: 600;
}
/* MD3 tab 指示器：底部 2px 横线，激活色 primary */
.tab--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px; /* 覆盖 tabs 的 border-bottom */
  height: 2px;
  background: var(--md-primary);
  border-radius: 1px;
}

/* ── 歌单列表 ── */
.list {
  display: flex;
  flex-direction: column;
}
.list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 0;
  cursor: pointer;
  transition: background-color 0.15s ease;
  /* 底部 Divider 分隔（最后一项不显示，由 list-item--last 控制） */
  border-bottom: 1px solid var(--md-outline-variant);
}
.list-item:hover {
  background: var(--md-surface-container);
}
.list-item--last {
  border-bottom: none;
}
.list-item__cover {
  flex-shrink: 0;
}
.list-item__text {
  flex: 1;
  min-width: 0;
}
.list-item__title {
  font-size: 14px; /* titleMedium */
  font-weight: 500;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-item__subtitle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px; /* bodySmall */
  color: var(--md-on-surface-variant);
  margin-top: 2px;
}
.list-item__status-icon {
  color: var(--md-on-surface-variant);
  flex-shrink: 0;
}
.list-item__chevron {
  color: var(--md-on-surface-variant);
  flex-shrink: 0;
}

/* ── 空状态 ── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  gap: 12px;
}
.empty__icon {
  color: var(--md-on-surface-variant);
  opacity: 0.5;
}
.empty__text {
  font-size: 14px;
  color: var(--md-on-surface-variant);
}
</style>
