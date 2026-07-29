<script setup lang="ts">
// 歌单详情页：路由分发器（阶段 D 拆分）
// 按 route.name 渲染对应子组件：
// - playlist-local:    LocalPlaylistView（本地歌单 + 同步型歌单）
// - playlist-favorite: FavoritePlaylistView（B 站收藏夹远端视图）
// - playlist-toview:   稍后再看（暂未实现，404 兜底）
import { useRoute } from 'vue-router'
import LocalPlaylistView from '../components/playlist/LocalPlaylistView.vue'
import FavoritePlaylistView from '../components/playlist/FavoritePlaylistView.vue'

const route = useRoute()
</script>

<template>
  <LocalPlaylistView v-if="route.name === 'playlist-local'" />
  <FavoritePlaylistView v-else-if="route.name === 'playlist-favorite'" />
  <div
    v-else
    class="not-found"
  >
    未知歌单类型
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--md-on-surface-variant);
  font-size: 14px;
}
</style>
