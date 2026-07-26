// auth store（Pinia）
// 只存 UI 状态镜像 + 主进程状态镜像，不放业务数据
// 真源在主进程 appState，本 store 通过 onStateChanged 订阅推送
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { AuthStateSnapshot } from '../../shared/ipc-types'

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(false)
  const userInfo = ref<{
    mid?: number
    name?: string
    face?: string
    cachedAt?: number
  } | null>(null)

  let unsub: (() => void) | null = null

  /**
   * 订阅主进程登录态推送
   * 在 App.vue 顶层调用一次即可
   */
  function init(): void {
    if (unsub) return // 防止重复订阅
    unsub = window.api.auth.onStateChanged((snapshot: AuthStateSnapshot) => {
      isLoggedIn.value = snapshot.isLoggedIn
      userInfo.value = snapshot.userInfo
    })
  }

  async function logout(): Promise<void> {
    await window.api.auth.logout()
  }

  return { isLoggedIn, userInfo, init, logout }
})
