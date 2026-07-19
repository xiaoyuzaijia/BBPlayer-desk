<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { Icons } from '../utils/icons'
import CoverPlaceholder from '../components/common/CoverPlaceholder.vue'

// 三个 tab：本地歌单 / B站收藏 / 稍后再看
const tabs = [
  { key: 'local', label: '本地歌单' },
  { key: 'bilibili', label: 'B站收藏' },
  { key: 'watchlater', label: '稍后再看' },
] as const

const activeTab = ref<(typeof tabs)[number]['key']>('local')

// 列表项类型：封面标题 + 数量 + 状态（pinned 置顶 / cloud 远端 / download 已下载）
interface PlaylistItem {
  id: string
  title: string
  count: number
  coverUrl?: string
  status?: 'pinned' | 'cloud' | 'downloaded'
}

// 假数据：每个 tab 独立列表，coverUrl 留空走 CoverPlaceholder 占位符
const fakePlaylists: Record<string, PlaylistItem[]> = {
  local: [
    { id: 'l1', title: '我的歌单', count: 12, status: 'pinned' },
    { id: 'l2', title: '睡前轻音乐', count: 8, status: 'downloaded' },
    { id: 'l3', title: '跑步专用', count: 24 },
    { id: 'l4', title: '通勤路上', count: 15, status: 'downloaded' },
  ],
  bilibili: [
    { id: 'b1', title: 'Vocaloid 精选', count: 40, status: 'cloud' },
    { id: 'b2', title: '日系燃向合集', count: 48, status: 'cloud' },
  ],
  watchlater: [],
}

// 根据 status 返回对应状态图标
function statusIcon(status?: PlaylistItem['status']) {
  if (status === 'pinned') return Icons.pin
  if (status === 'cloud') return Icons.cloud
  if (status === 'downloaded') return Icons.downloadDone
  return null
}
</script>

<template>
  <div class="library">
    <h2 class="library__title">音乐库</h2>

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
    <div v-if="fakePlaylists[activeTab].length > 0" class="list">
      <div
        v-for="(item, idx) in fakePlaylists[activeTab]"
        :key="item.id"
        class="list-item"
        :class="{ 'list-item--last': idx === fakePlaylists[activeTab].length - 1 }"
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
          <div class="list-item__title">{{ item.title }}</div>
          <div class="list-item__subtitle">
            <Icon
              v-if="statusIcon(item.status)"
              :icon="statusIcon(item.status)!"
              :width="13"
              :height="13"
              class="list-item__status-icon"
            />
            <span>{{ item.count }} 首</span>
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
    <div v-else class="empty">
      <Icon :icon="Icons.library" :width="48" :height="48" class="empty__icon" />
      <p class="empty__text">暂无内容</p>
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
