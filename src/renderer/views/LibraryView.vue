<script setup lang="ts">
// 音乐库视图：4 tab 结构（对齐 BBPlayer）
//
// 当前实现：
// - local tab：DB 所有歌单（含同步型 favorite/collection/multi_page）
// - favorite tab：B 站 API 收藏夹列表（未同步的也显示）
// - collection / multiPage tab：占位空状态（未实现）
//
// 数据源约定（AGENTS.md）：
// - local tab 走 usePlaylists()（TanStack Query，DB 数据）
// - favorite tab 走 useFavoritePlaylists()（TanStack Query，B 站 API）
// - 歌单列表不放 Pinia store
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Icons } from '../utils/icons'
import CoverPlaceholder from '../components/common/CoverPlaceholder.vue'
import { usePlaylists } from '../composables/queries/db/playlist'
import { useFavoritePlaylists } from '../composables/queries/bilibili/favorite'
import { useAuthStore } from '../stores/auth'
import { resolveBilibiliImageUrl } from '../utils/imageUrl'
import type { Playlist } from '../types/playlist'
import type { BilibiliFavoriteFolder } from '../types/bilibili'

const router = useRouter()
const auth = useAuthStore()

// ── Tab 定义 ──
// local + favorite 已实现，collection + multiPage 为占位
const tabs = [
  { key: 'local', label: '播放列表' },
  { key: 'favorite', label: '收藏夹' },
  { key: 'collection', label: '合集' },
  { key: 'multiPage', label: '分P' },
] as const

type TabKey = (typeof tabs)[number]['key']
const activeTab = ref<TabKey>('local')

// ── local tab 数据源：DB 所有歌单（含同步型） ──
const {
  data: playlists,
  isLoading: isPlaylistsLoading,
  isError: isPlaylistsError,
  error: playlistsError,
} = usePlaylists()

// ── favorite tab 数据源：B 站 API 收藏夹列表 ──
const {
  data: favoriteFolders,
  isLoading: isFavoritesLoading,
  isError: isFavoritesError,
  error: favoritesError,
} = useFavoritePlaylists()

// ── 收藏夹封面代理 URL 缓存（folder.id → resolved URL） ──
// B 站 CDN 防盗链，需走本地图片代理（resolveBilibiliImageUrl）
// watchEffect 自动追踪 favoriteFolders 变化，onCleanup 防止竞态覆盖
const favoriteCovers = ref<Map<number, string | null>>(new Map())
watchEffect(async (onCleanup) => {
  const folders = favoriteFolders.value
  if (!folders || folders.length === 0) {
    favoriteCovers.value = new Map()
    return
  }
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  const resolved = new Map<number, string | null>()
  await Promise.all(
    folders.map(async (f) => {
      const url = await resolveBilibiliImageUrl(f.cover, 96)
      resolved.set(f.id, url ?? null)
    }),
  )
  if (!cancelled) {
    favoriteCovers.value = resolved
  }
})

// local tab 列表（所有歌单，含同步型，不再按 type 过滤）
const localList = computed<Playlist[]>(() => playlists.value ?? [])

// favorite tab 列表（已过滤 [mp] 分 P 收藏夹，hook 内处理）
const favoriteList = computed<BilibiliFavoriteFolder[]>(
  () => favoriteFolders.value ?? [],
)

// 根据 playlist.type 与 isPinned 决定状态图标
function localStatusIcon(playlist: Playlist): string | null {
  if (playlist.isPinned) return Icons.pin
  // 远端同步型（有 lastSyncedAt）显示 cloud
  if (playlist.type !== 'local' && playlist.lastSyncedAt) return Icons.cloud
  return null
}

// 列表项点击：按 activeTab 跳转不同路由
// - local tab：playlist-local/:id（id 是本地 playlistId）
// - favorite tab：playlist-favorite/:id（id 是 B 站 favoriteId）
function goToLocalPlaylist(item: Playlist) {
  router.push({ name: 'playlist-local', params: { id: String(item.id) } })
}

function goToFavoritePlaylist(folder: BilibiliFavoriteFolder) {
  router.push({ name: 'playlist-favorite', params: { id: String(folder.id) } })
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

    <!-- ── local tab：DB 所有歌单（含同步型） ── -->
    <template v-if="activeTab === 'local'">
      <!-- 加载中 -->
      <div
        v-if="isPlaylistsLoading"
        class="empty"
      >
        <p class="empty__text">
          加载中…
        </p>
      </div>

      <!-- 加载错误 -->
      <div
        v-else-if="isPlaylistsError"
        class="empty"
      >
        <p class="empty__text">
          加载失败：{{ playlistsError?.message ?? '未知错误' }}
        </p>
      </div>

      <!-- 歌单列表 -->
      <div
        v-else-if="localList.length > 0"
        class="list"
      >
        <div
          v-for="(item, idx) in localList"
          :key="item.id"
          class="list-item"
          :class="{ 'list-item--last': idx === localList.length - 1 }"
          @click="goToLocalPlaylist(item)"
        >
          <CoverPlaceholder
            :title="item.title"
            :size="48"
            :cover-url="item.coverUrl ?? undefined"
            class="list-item__cover"
          />
          <div class="list-item__text">
            <div class="list-item__title">
              {{ item.title }}
            </div>
            <div class="list-item__subtitle">
              <Icon
                v-if="localStatusIcon(item)"
                :icon="localStatusIcon(item)!"
                :width="13"
                :height="13"
                class="list-item__status-icon"
              />
              <span>{{ item.itemCount }} 首</span>
            </div>
          </div>
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
          暂无歌单，点击侧边栏"新建歌单"开始
        </p>
      </div>
    </template>

    <!-- ── favorite tab：B 站 API 收藏夹列表 ── -->
    <template v-else-if="activeTab === 'favorite'">
      <!-- 未登录 -->
      <div
        v-if="!auth.isLoggedIn"
        class="empty"
      >
        <Icon
          :icon="Icons.cloudOff"
          :width="48"
          :height="48"
          class="empty__icon"
        />
        <p class="empty__text">
          请先登录 B 站账号
        </p>
      </div>

      <!-- 加载中 -->
      <div
        v-else-if="isFavoritesLoading"
        class="empty"
      >
        <p class="empty__text">
          加载中…
        </p>
      </div>

      <!-- 加载错误 -->
      <div
        v-else-if="isFavoritesError"
        class="empty"
      >
        <p class="empty__text">
          加载失败：{{ favoritesError?.message ?? '未知错误' }}
        </p>
      </div>

      <!-- 收藏夹列表 -->
      <div
        v-else-if="favoriteList.length > 0"
        class="list"
      >
        <div
          v-for="(folder, idx) in favoriteList"
          :key="folder.id"
          class="list-item"
          :class="{ 'list-item--last': idx === favoriteList.length - 1 }"
          @click="goToFavoritePlaylist(folder)"
        >
          <CoverPlaceholder
            :title="folder.title"
            :size="48"
            :cover-url="favoriteCovers.get(folder.id) ?? undefined"
            class="list-item__cover"
          />
          <div class="list-item__text">
            <div class="list-item__title">
              {{ folder.title }}
            </div>
            <div class="list-item__subtitle">
              <!-- 列表项不查同步状态，避免 N+1 -->
              <span>{{ folder.media_count }} 首</span>
            </div>
          </div>
          <Icon
            :icon="Icons.chevronRight"
            :width="24"
            :height="24"
            class="list-item__chevron"
          />
        </div>
      </div>

      <!-- 空状态（已登录但无收藏夹） -->
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
          B 站账号下没有收藏夹
        </p>
      </div>
    </template>

    <!-- ── collection / multiPage tab：占位空状态 ── -->
    <template v-else>
      <div class="empty">
        <Icon
          :icon="Icons.library"
          :width="48"
          :height="48"
          class="empty__icon"
        />
        <p class="empty__text">
          暂未实现
        </p>
      </div>
    </template>
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
