import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('../views/LibraryView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue'),
    },
    {
      path: '/player',
      name: 'player',
      component: () => import('../views/PlayerView.vue'),
    },
    {
      path: '/icons',
      name: 'icons',
      component: () => import('../views/IconsView.vue'),
    },
    // 歌单详情页：按类型分 3 个路由
    // - playlist-local:   完全本地歌单 + 同步型本地歌单（按 id 区分）
    // - playlist-favorite: B 站收藏夹（远端只读）
    // - playlist-toview:  稍后再看（全局唯一，无 id）
    {
      path: '/playlist/local/:id',
      name: 'playlist-local',
      component: () => import('../views/PlaylistView.vue'),
    },
    {
      path: '/playlist/favorite/:id',
      name: 'playlist-favorite',
      component: () => import('../views/PlaylistView.vue'),
    },
    {
      path: '/playlist/toview',
      name: 'playlist-toview',
      component: () => import('../views/PlaylistView.vue'),
    },
  ],
})

export default router
