// 弹窗组件注册表：ModalKey → 懒加载组件（对应 BBPlayer ModalRegistry）
// 新增弹窗：defineAsyncComponent(() => import(...)) 加一行
import { defineAsyncComponent, type Component } from 'vue'

import type { ModalKey } from '../../types/modal'

export const modalRegistry: Record<ModalKey, Component> = {
  QrLogin: defineAsyncComponent(() => import('./QrLoginModal.vue')),
  ManualSearchLyrics: defineAsyncComponent(
    () => import('./ManualSearchLyricsModal.vue'),
  ),
}
