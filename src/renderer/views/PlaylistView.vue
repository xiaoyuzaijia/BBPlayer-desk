<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Icons } from '../utils/icons'
import IconButton from '../components/common/IconButton.vue'
import PlaylistHeader from '../components/playlist/PlaylistHeader.vue'
import TrackList from '../components/playlist/TrackList.vue'
import { usePlaylistStore } from '../stores/playlist'
import { usePlaybackStore } from '../stores/playback'
import type { Playlist } from '../types/playlist'
import type { Track } from '../types/track'

// 歌单详情页：按 route.name 路由到不同歌单
// - playlist-local:    按 :id 取本地歌单（local 或 synced）
// - playlist-favorite: 按 :id 取 B 站收藏夹
// - playlist-toview:   取稍后再看（全局唯一）
const route = useRoute()
const router = useRouter()
const playlistStore = usePlaylistStore()
const playback = usePlaybackStore()
const { currentTrack, isPlaying } = storeToRefs(playback)

// 根据 route.name + params.id 取歌单
const playlist = computed<Playlist | undefined>(() => {
  const name = route.name as string
  if (name === 'playlist-toview') {
    return playlistStore.getToViewPlaylist()
  }
  const id = route.params.id as string
  if (!id) return undefined
  // playlist-local 路由可以同时承载 local 和 synced 类型
  // playlist-favorite 只承载 favorite 类型
  return playlistStore.getPlaylistById(id)
})

// 点击返回
function goBack() {
  // 优先退回上一页；若无历史则回音乐库
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'library' })
  }
}

// 播放全部：替换队列为歌单所有曲目，从第一首开始
function playAll() {
  if (!playlist.value) return
  playback.playAll(playlist.value.tracks, 0)
}

// 点击曲目行：播放该曲目（playback.play 内部处理追加/跳转）
function clickTrack(track: Track) {
  playback.play(track)
}

// 占位：后续接入实际逻辑
function handleSync() {
  // TODO: 接入 B 站同步流程
  console.log('[sync] placeholder', playlist.value?.id)
}
function handleAddTrack() {
  // TODO: 打开添加歌曲面板
  console.log('[addTrack] placeholder', playlist.value?.id)
}
function handleMore() {
  // TODO: 打开更多菜单（排序 / 编辑信息 / 删除等）
  console.log('[more] placeholder', playlist.value?.id)
}
function handleTrackMore(track: Track) {
  // TODO: 打开曲目菜单（加入歌单 / 下载 / 删除等）
  console.log('[trackMore] placeholder', track.id)
}
</script>

<template>
  <div class="playlist-view">
    <!-- 顶栏：返回 + 标题 + 更多（h-14，level1 阴影分界） -->
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

    <!-- 主体：Header + TrackList（限宽居中，桌面友好） -->
    <div
      v-if="playlist"
      class="playlist-view__body"
    >
      <PlaylistHeader
        :playlist="playlist"
        @play-all="playAll"
        @sync="handleSync"
        @add-track="handleAddTrack"
        @more="handleMore"
      />

      <div class="playlist-view__list">
        <TrackList
          :tracks="playlist.tracks"
          :current-track-id="currentTrack?.id ?? ''"
          :is-playing="isPlaying"
          @click-track="clickTrack"
          @more-track="handleTrackMore"
        />
      </div>
    </div>

    <!-- 找不到歌单：404 兜底 -->
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

/* 顶栏：固定 56 高，level1 阴影分界 */
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
  font-size: 16px; /* titleMedium */
  font-weight: 500;
  color: var(--md-on-surface);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 主体：可滚动，限宽 1024 居中 */
.playlist-view__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.playlist-view__list {
  max-width: 1024px;
  margin: 0 auto;
  padding: 0 32px 96px; /* 底部留 96 给 NowPlayingBar */
}

/* 404 兜底 */
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
