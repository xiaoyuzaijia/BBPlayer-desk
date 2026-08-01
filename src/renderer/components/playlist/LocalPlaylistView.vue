<script setup lang="ts">
// 本地歌单详情视图（从 PlaylistView 拆出）
//
// 职责：渲染本地歌单详情（包括 type=local 和同步型 favorite/collection/multi_page）
// 数据源：
// - usePlaylists() 缓存中按 id 查找（歌单元数据）
// - usePlaylistTracks(playlistId)（曲目列表）
//
// 头部按钮逻辑（对齐 BBPlayer LocalPlaylistHeader）：
// - 播放全部：始终显示
// - 同步：仅 type !== 'local' 显示（重新同步）
// - 复制 / 下载：始终显示（disabled，功能暂未实现）
// - 不显示箭头按钮（已在本地页面）
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Icons } from '../../utils/icons'
import IconButton from '../common/IconButton.vue'
import PlaylistHeader from './PlaylistHeader.vue'
import TrackList from './TrackList.vue'
import {
  usePlaylists,
  usePlaylistTracks,
} from '../../composables/queries/db/playlist'
import {
  useSyncRemotePlaylist,
  useSyncProgress,
} from '../../composables/mutations/db/playlist'
import { usePlaybackStore } from '../../stores/playback'
import type { Playlist } from '../../types/playlist'
import type { Track } from '../../types/track'

const route = useRoute()
const router = useRouter()
const playback = usePlaybackStore()
const { currentTrack, isPlaying } = storeToRefs(playback)

// 解析 route.params.id 为 number
const playlistId = computed<number | null>(() => {
  const idParam = route.params.id as string | undefined
  if (!idParam) return null
  const id = Number(idParam)
  return Number.isNaN(id) ? null : id
})

// 歌单元数据：从 usePlaylists 缓存里按 id 查找（无需单独的 detail query）
const { data: allPlaylists, isLoading: playlistsLoading } = usePlaylists()
const playlist = computed<Playlist | undefined>(() => {
  if (playlistId.value === null) return undefined
  return allPlaylists.value?.find((p) => p.id === playlistId.value)
})

// 歌单的曲目列表
const {
  data: tracks,
  isLoading: tracksLoading,
  isError: tracksError,
  error: tracksErrMsg,
} = usePlaylistTracks(() => playlistId.value ?? 0)

// 同步 mutation + 进度订阅（仅同步型歌单用）
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

// 同步成功后清空进度（5 秒后）
watch(
  () => syncProgress.value?.stage,
  (stage) => {
    if (stage === 'completed' || stage === 'error') {
      setTimeout(() => {
        syncProgress.value = null
      }, 5000)
    }
  },
)

// 点击返回
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'library' })
  }
}

// 播放全部
function playAll() {
  const list = tracks.value
  if (!list || list.length === 0) return
  playback.playAll(list, 0)
}

// 点击曲目行
function clickTrack(track: Track) {
  playback.play(track)
}

// 同步按钮：仅同步型歌单（type !== 'local' 且 remoteSyncId !== null）
function handleSync() {
  const p = playlist.value
  if (!p || p.remoteSyncId === null) return
  syncMutation.mutate({ remoteSyncId: p.remoteSyncId, type: p.type })
}

function handleMore() {
  // TODO: 打开更多菜单
  console.log('[more] placeholder', playlist.value?.id)
}
function handleTrackMore(track: Track) {
  // TODO: 打开曲目菜单
  console.log('[trackMore] placeholder', track.id)
}
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
        {{ playlist?.title ?? '歌单' }}
      </h2>
      <IconButton
        :icon="Icons.more"
        :size="20"
        @click="handleMore"
      />
    </header>

    <!-- 主体 -->
    <div
      v-if="playlist"
      class="playlist-view__body"
    >
      <PlaylistHeader
        :playlist="playlist"
        :tracks="tracks ?? []"
        :syncing="isSyncing"
        @play-all="playAll"
        @sync="handleSync"
        @more="handleMore"
      />

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
        <div
          v-if="tracksLoading"
          class="playlist-view__loading"
        >
          加载曲目中…
        </div>
        <div
          v-else-if="tracksError"
          class="playlist-view__loading"
        >
          加载失败：{{ tracksErrMsg?.message ?? '未知错误' }}
        </div>
        <TrackList
          v-else
          :tracks="tracks ?? []"
          :current-track-id="currentTrack?.id ?? null"
          :is-playing="isPlaying"
          @click-track="clickTrack"
          @more-track="handleTrackMore"
        />
      </div>
    </div>

    <!-- 歌单加载中 -->
    <div
      v-else-if="playlistsLoading"
      class="playlist-view__loading"
    >
      加载歌单中…
    </div>

    <!-- 404 兜底 -->
    <div
      v-else
      class="playlist-view__not-found"
    >
      <p>歌单不存在或已删除</p>
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
