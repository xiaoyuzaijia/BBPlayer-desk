// 全局弹窗栈（参考 BBPlayer useModalStore）
// - open 入栈（按 key 去重，同一弹窗不允许重复打开）
// - close / closeTop 弹栈
// 与 BBPlayer 的差异：桌面端无系统返回手势，去掉路由挂载与 mitt 关闭事件；
// props 类型由 ModalPropsMap 泛型约束（open 时 props 必须与 key 匹配）
import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { ModalInstance, ModalKey, ModalPropsMap } from '../types/modal'

export const useModalStore = defineStore('modal', () => {
  const modals = ref<ModalInstance[]>([])

  function open<K extends ModalKey>(key: K, props: ModalPropsMap[K]) {
    if (modals.value.some((m) => m.key === key)) return
    modals.value = [...modals.value, { key, props }]
  }

  function close(key: ModalKey) {
    modals.value = modals.value.filter((m) => m.key !== key)
  }

  function closeTop() {
    modals.value = modals.value.slice(0, -1)
  }

  return { modals, open, close, closeTop }
})
