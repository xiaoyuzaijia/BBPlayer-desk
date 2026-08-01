<script setup lang="ts">
// B 站收藏夹远端视图
//
// 职责：渲染 B 站收藏夹详情（未同步/已同步均显示）
// 数据源：
// - useFavoriteListContents(favoriteId)：远端曲目列表（B 站 API）
// - useLinkedPlaylist('favorite', favoriteId)：复用 usePlaylists 缓存判断是否已同步
//
// 头部按钮逻辑：
// - 未同步：显示"同步到本地"
// - 已同步：显示"重新同步" + 箭头按钮（跳到对应本地歌单）
// - 同步成功后：未同步场景自动跳转到新的本地歌单页
//
// 远端曲目点击播放：
// - BilibiliFavoriteMedia 不能直接当 Track 用（缺 id/uniqueKey）
// - 点击 → 调 bilibili.addTrackByBvid 入库得 Track → playback.play(track)
import { computed, nextTick, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Icons } from '../../utils/icons'
import IconButton from '../common/IconButton.vue'
import CoverPlaceholder from '../common/CoverPlaceholder.vue'
import { useFavoriteListContents } from '../../composables/queries/bilibili/favorite'
import { useLinkedPlaylist } from '../../composables/queries/db/playlist'
import {
  useSyncRemotePlaylist,
  useSyncProgress,
} from '../../composables/mutations/db/playlist'
import { usePlaybackStore } from '../../stores/playback'
import { resolveBilibiliImageUrl } from '../../utils/imageUrl'
import { formatTime } from '../../utils/format'
import type { BilibiliFavoriteMedia } from '../../types/bilibili'
import type { Track } from '../../types/track'

const route = useRoute()
const router = useRouter()
const playback = usePlaybackStore()

// favoriteId 从 route.params.id 解析（B 站收藏夹 fid）
const favoriteId = computed(() => Number(route.params.id as string))

// 收藏夹内容（远端 API，无限分页）
const {
  data: infiniteData,
  isLoading,
  isError,
  error,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
} = useFavoriteListContents(favoriteId)

// 是否已同步 + 已同步的本地 playlistId
// useLinkedPlaylist 是 computed，复用 usePlaylists 缓存按 remoteSyncId 过滤
const linkedPlaylistId = useLinkedPlaylist('favorite', favoriteId)
const isSynced = computed(() => linkedPlaylistId.value !== null)

// 同步 mutation + 进度订阅
const syncMutation = useSyncRemotePlaylist()
const syncProgress = useSyncProgress()

const isSyncing = computed(() => {
  if (syncMutation.isPending.value) return true
  const stage = syncProgress.value?.stage
  if (stage === undefined || stage === null) return false
  return stage !== 'completed' && stage !== 'error'
})

const syncStatusText = computed(() => {
  const p = syncProgress.value
  if (!p) return null
  if (p.stage === 'completed') return '同步完成'
  if (p.stage === 'error') return `同步失败：${p.message}`
  if (p.current !== undefined && p.total !== undefined) {
    return `${p.message} (${p.current}/${p.total})`
  }
  return p.message
})

// 主按钮文案
const mainButtonText = computed(() => {
  if (isSyncing.value) return '同步中…'
  return isSynced.value ? '重新同步' : '同步到本地'
})

// 收藏夹元信息（来自第一页的 info，所有页 info 相同）
const folderInfo = computed(() => infiniteData.value?.pages[0]?.info ?? null)
// 远端曲目列表：合并所有已加载页的 medias（每页 medias 可能为 null）
// 与 BBPlayer favorite/[id].tsx 的 pages.flatMap((p) => p.medias ?? []) 模式一致
const mediaList = computed<BilibiliFavoriteMedia[]>(() =>
  infiniteData.value
    ? infiniteData.value.pages.flatMap((p) => p.medias ?? [])
    : [],
)

// 收藏夹封面代理 URL（B 站 CDN 防盗链）
const folderCoverUrl = ref<string | null>(null)
watchEffect(async () => {
  const cover = folderInfo.value?.cover ?? null
  folderCoverUrl.value = (await resolveBilibiliImageUrl(cover, 200)) ?? null
})

// 远端曲目封面代理（bvid → resolved URL）
const mediaCovers = ref<Map<string, string | null>>(new Map())
watchEffect(async (onCleanup) => {
  const medias = mediaList.value
  if (medias.length === 0) {
    mediaCovers.value = new Map()
    return
  }
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })
  const resolved = new Map<string, string | null>()
  await Promise.all(
    medias.map(async (m) => {
      const url = await resolveBilibiliImageUrl(m.cover, 48)
      resolved.set(m.bvid, url ?? null)
    }),
  )
  if (!cancelled) {
    mediaCovers.value = resolved
  }
})

// 正在入库的 bvid 集合（点击后立即显示 loading，避免感知延迟）
const pendingBvids = ref<Set<string>>(new Set())

// 点击返回
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'library' })
  }
}

// 同步按钮点击
function handleSync() {
  syncMutation.mutate(
    { remoteSyncId: favoriteId.value, type: 'favorite' },
    {
      onSuccess: (newPlaylistId) => {
        // 未同步时同步成功后跳转；已同步（重新同步）不跳转
        if (!isSynced.value && newPlaylistId !== undefined) {
          router.push({
            name: 'playlist-local',
            params: { id: String(newPlaylistId) },
          })
        }
      },
    },
  )
}

// 箭头按钮：跳转到对应本地歌单
function goToLocalPlaylist() {
  if (linkedPlaylistId.value) {
    router.push({
      name: 'playlist-local',
      params: { id: String(linkedPlaylistId.value) },
    })
  }
}

// 点击远端曲目：先入库再播放
async function clickMedia(media: BilibiliFavoriteMedia) {
  if (pendingBvids.value.has(media.bvid)) return
  pendingBvids.value = new Set(pendingBvids.value).add(media.bvid)
  try {
    const res = await window.api.bilibili.addTrackByBvid(
      media.bvid,
      media.cid ?? undefined,
    )
    if (!res.ok) {
      console.error('[clickMedia] 入库失败:', res.error.message)
      return
    }
    playback.play(res.data as Track)
  } catch (e) {
    console.error('[clickMedia] 异常:', e)
  } finally {
    const next = new Set(pendingBvids.value)
    next.delete(media.bvid)
    pendingBvids.value = next
  }
}

function handleMore() {
  // TODO: 打开更多菜单
  console.log('[more] placeholder', favoriteId.value)
}

// ── 自动滚动加载（IntersectionObserver） ──
// 与 BBPlayer LegendList 的 onEndReached 等价：哨兵元素进入视口时 fetchNextPage
// 监听一个挂在列表底部的 .media-list__sentinel 元素
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupObserver() {
  // 清理旧 observer
  if (observer) {
    observer.disconnect()
    observer = null
  }
  const sentinel = sentinelRef.value
  if (!sentinel) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (
          entry.isIntersecting &&
          hasNextPage.value &&
          !isFetchingNextPage.value
        ) {
          fetchNextPage()
        }
      }
    },
    // rootMargin: 提前 400px 触发，避免用户滚到底才加载的感知延迟
    // （对应 BBPlayer 的 onEndReachedThreshold=0.8）
    { rootMargin: '400px' },
  )
  observer.observe(sentinel)
}

// mediaList 变化后 DOM 更新完成 → 重新挂 observer（哨兵元素重新渲染）
watch(
  () => mediaList.value.length,
  () => {
    nextTick(setupObserver)
  },
)

// favoriteId 变化（切换收藏夹）→ 等 DOM 重建后挂 observer
watch(favoriteId, () => {
  nextTick(setupObserver)
})

// 组件卸载时清理
onUnmounted(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <div class="playlist-view">
    <!-- 顶栏：返回 + 标题 + 更多 -->
    <header class="topbar">
      <IconButton
        :icon="Icons.chevronLeft"
        :size="28"
        @click="goBack"
      />
      <h2 class="topbar__title">
        {{ folderInfo?.title ?? '收藏夹' }}
      </h2>
      <IconButton
        :icon="Icons.more"
        :size="20"
        @click="handleMore"
      />
    </header>

    <!-- 主体 -->
    <div
      v-if="folderInfo || isLoading"
      class="playlist-view__body"
    >
      <!-- 自定义 header（BilibiliFavoriteFolder 不是 Playlist 类型，不复用 PlaylistHeader） -->
      <header class="fav-header">
        <!-- 上半：封面 + 信息 -->
        <div class="fav-header__main">
          <CoverPlaceholder
            :title="folderInfo?.title ?? '收藏夹'"
            :size="120"
            :cover-url="folderCoverUrl ?? undefined"
            class="fav-header__cover"
          />
          <div class="fav-header__info">
            <h1 class="fav-header__title">
              {{ folderInfo?.title ?? '收藏夹' }}
            </h1>
            <div class="fav-header__meta">
              <span class="fav-header__type-badge">B站收藏</span>
              <span>{{ folderInfo?.media_count ?? mediaList.length }} 首</span>
            </div>
            <p
              v-if="folderInfo?.intro"
              class="fav-header__desc"
            >
              {{ folderInfo.intro }}
            </p>
          </div>
        </div>

        <!-- 下半：操作按钮行 -->
        <div class="fav-header__actions">
          <!-- 同步到本地 / 重新同步 -->
          <button
            class="btn btn--outlined"
            :disabled="isSyncing || mediaList.length === 0"
            @click="handleSync"
          >
            <Icon
              :icon="Icons.cloud"
              :width="20"
              :height="20"
            />
            <span>{{ mainButtonText }}</span>
          </button>

          <!-- 跳转本地歌单（已同步时显示） -->
          <IconButton
            v-if="isSynced"
            :icon="Icons.chevronRight"
            :size="20"
            @click="goToLocalPlaylist"
          />

          <!-- 更多 -->
          <IconButton
            :icon="Icons.more"
            :size="20"
            @click="handleMore"
          />
        </div>
      </header>

      <!-- 同步进度条 -->
      <div
        v-if="syncStatusText"
        class="playlist-view__sync-status"
        :class="{
          'playlist-view__sync-status--error':
            syncProgress?.stage === 'error',
          'playlist-view__sync-status--done':
            syncProgress?.stage === 'completed',
        }"
      >
        {{ syncStatusText }}
      </div>

      <div class="playlist-view__list">
        <!-- 加载中 -->
        <div
          v-if="isLoading"
          class="playlist-view__loading"
        >
          加载曲目中…
        </div>
        <!-- 加载错误 -->
        <div
          v-else-if="isError"
          class="playlist-view__loading"
        >
          加载失败：{{ error?.message ?? '未知错误' }}
        </div>
        <!-- 远端曲目列表（内联渲染，BilibiliFavoriteMedia 不是 Track） -->
        <div
          v-else-if="mediaList.length > 0"
          class="media-list"
        >
          <!-- 表头 -->
          <div class="media-list__header">
            <div class="media-list__index-col">
              #
            </div>
            <div class="media-list__cover-col" />
            <div class="media-list__title-col">
              标题
            </div>
            <div class="media-list__duration-col">
              时长
            </div>
            <div class="media-list__action-col" />
          </div>
          <!-- 列表项 -->
          <div
            v-for="(media, idx) in mediaList"
            :key="media.bvid"
            class="media-item"
            :class="{
              'media-item--invalid': media.attr !== 0,
              'media-item--pending': pendingBvids.has(media.bvid),
            }"
            @click="clickMedia(media)"
          >
            <!-- 序号 -->
            <div class="media-item__index">
              <Icon
                v-if="pendingBvids.has(media.bvid)"
                :icon="Icons.refresh"
                :width="16"
                :height="16"
                class="media-item__spinner"
              />
              <span v-else>{{ idx + 1 }}</span>
            </div>
            <!-- 48 封面 -->
            <CoverPlaceholder
              :title="media.title"
              :size="48"
              :cover-url="mediaCovers.get(media.bvid) ?? undefined"
              class="media-item__cover"
            />
            <!-- 标题 + UP 主 -->
            <div class="media-item__text">
              <div class="media-item__title">
                {{ media.title }}
              </div>
              <div class="media-item__subtitle">
                {{ media.upper.name }}
              </div>
            </div>
            <!-- 时长 -->
            <div class="media-item__duration">
              {{ formatTime(media.duration) }}
            </div>
            <!-- 占位（与 TrackListItem 列对齐） -->
            <div class="media-item__action" />
          </div>
          <!-- 哨兵元素 + 加载更多 footer -->
          <div
            ref="sentinelRef"
            class="media-list__footer"
          >
            <div
              v-if="isFetchingNextPage"
              class="media-list__loading-more"
            >
              <Icon
                :icon="Icons.refresh"
                :width="16"
                :height="16"
                class="media-item__spinner"
              />
              <span>加载更多…</span>
            </div>
            <span
              v-else-if="hasNextPage"
              class="media-list__hint"
            >向下滚动加载更多</span>
            <span
              v-else
              class="media-list__hint"
            >已加载全部</span>
          </div>
        </div>
        <!-- 空收藏夹 -->
        <div
          v-else
          class="playlist-view__loading"
        >
          收藏夹为空
        </div>
      </div>
    </div>

    <!-- 404 兜底 -->
    <div
      v-else
      class="playlist-view__not-found"
    >
      <p>收藏夹不存在或加载失败</p>
      <button
        class="back-btn"
        @click="goBack"
      >
        返回
      </button>
    </div>
  </div>
</template>

<style scoped>
.playlist-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 0 16px;
  background: var(--md-surface);
  box-shadow: var(--md-elevation-shadow-level1);
  position: sticky;
  top: 0;
  z-index: 10;
}
.topbar__title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--md-on-surface);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-view__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.playlist-view__list {
  max-width: 1024px;
  margin: 0 auto;
  padding: 0 32px 96px;
}

/* ── 自定义 header（与 PlaylistHeader 视觉一致，但接受 BilibiliFavoriteFolder） ── */
.fav-header {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.fav-header__main {
  display: flex;
  gap: 24px;
  align-items: flex-end;
}
.fav-header__cover {
  flex-shrink: 0;
}
.fav-header__info {
  flex: 1;
  min-width: 0;
  padding-bottom: 8px;
}
.fav-header__title {
  font-size: 28px;
  font-weight: 700;
  color: var(--md-on-surface);
  margin: 0 0 12px 0;
  line-height: 1.2;
  word-break: break-word;
}
.fav-header__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--md-on-surface-variant);
  margin-bottom: 8px;
}
.fav-header__type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 9999px;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
  font-size: 12px;
  font-weight: 500;
}
.fav-header__desc {
  font-size: 14px;
  color: var(--md-on-surface-variant);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.fav-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* MD3 按钮基础样式（与 PlaylistHeader 一致） */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  height: 40px;
  border-radius: 9999px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
  border: none;
}
.btn--outlined {
  background: transparent;
  color: var(--md-primary);
  border: 1px solid var(--md-outline);
}
.btn--outlined:hover:not(:disabled) {
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.btn:disabled:hover {
  background: transparent;
  box-shadow: none;
}

/* ── 同步进度条 ── */
.playlist-view__sync-status {
  max-width: 1024px;
  margin: 0 auto;
  padding: 8px 32px;
  font-size: 13px;
  color: var(--md-on-surface-variant);
}
.playlist-view__sync-status--error {
  color: var(--md-error);
}
.playlist-view__sync-status--done {
  color: var(--md-primary);
}

/* ── 远端曲目列表（与 TrackListItem 列布局对齐） ── */
.media-list {
  width: 100%;
}
.media-list__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 0;
  border-bottom: 1px solid var(--md-outline-variant);
  font-size: 12px;
  font-weight: 500;
  color: var(--md-on-surface-variant);
}
.media-list__index-col {
  width: 32px;
  text-align: center;
  flex-shrink: 0;
}
.media-list__cover-col {
  width: 48px;
  flex-shrink: 0;
}
.media-list__title-col {
  flex: 1;
  min-width: 0;
}
.media-list__duration-col {
  flex-shrink: 0;
}
.media-list__action-col {
  width: 36px;
  flex-shrink: 0;
}

.media-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 0;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-bottom: 1px solid var(--md-outline-variant);
}
.media-item:hover {
  background: var(--md-surface-container);
}
/* 失效视频：降低不透明度 */
.media-item--invalid {
  opacity: 0.5;
}
/* 入库中：背景高亮 */
.media-item--pending {
  background: color-mix(in srgb, var(--md-primary) 12%, transparent);
}

.media-item__index {
  width: 32px;
  flex-shrink: 0;
  text-align: center;
  font-size: 14px;
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
}
.media-item__spinner {
  color: var(--md-primary);
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.media-item__cover {
  flex-shrink: 0;
}
.media-item__text {
  flex: 1;
  min-width: 0;
}
.media-item__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.media-item__subtitle {
  font-size: 12px;
  color: var(--md-on-surface-variant);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.media-item__duration {
  font-size: 12px;
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.media-item__action {
  width: 36px;
  flex-shrink: 0;
}

/* ── 列表底部哨兵 + 加载更多 footer ── */
.media-list__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  min-height: 48px;
}
.media-list__loading-more {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--md-on-surface-variant);
}
.media-list__hint {
  font-size: 12px;
  color: var(--md-on-surface-variant);
  opacity: 0.7;
}

/* ── 加载 / 404 ── */
.playlist-view__loading {
  padding: 48px 32px;
  text-align: center;
  color: var(--md-on-surface-variant);
  font-size: 14px;
}
.playlist-view__not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--md-on-surface-variant);
}
.back-btn {
  padding: 8px 24px;
  border-radius: 9999px;
  border: 1px solid var(--md-outline);
  background: transparent;
  color: var(--md-primary);
  cursor: pointer;
  font-size: 14px;
}
.back-btn:hover {
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}
</style>
