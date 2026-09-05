<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/layout/Sidebar.vue'
import NowPlayingBar from './components/layout/NowPlayingBar.vue'
import ModalHost from './components/modals/ModalHost.vue'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { useAudioEngine } from './composables/useAudioEngine'

// auth store 在 App 顶层初始化一次，订阅主进程登录态推送
useAuthStore().init()
useThemeStore()

// 播放引擎：<audio> 元素与 playback store 双向绑定
// 必须在 App onMounted 调一次，整个应用共享一个 audio 元素
const { ensureAudioEl } = useAudioEngine()
onMounted(() => ensureAudioEl())

const route = useRoute()
// 进入 PlayerView 时隐藏 NowPlayingBar（避免与播放器重复显示）
const showNowPlayingBar = computed(() => route.name !== 'player')
</script>

<template>
  <div
    class="flex h-screen bg-md-surface text-md-on-surface"
  >
    <Sidebar />
    <main class="flex-1 flex flex-col overflow-auto">
      <RouterView />
    </main>
    <NowPlayingBar v-if="showNowPlayingBar" />
    <!-- 全局弹窗宿主：渲染 modal store 的弹窗栈 -->
    <ModalHost />
  </div>
</template>
