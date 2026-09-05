// 全局弹窗类型（参考 BBPlayer types/navigation.ts 的 ModalPropsMap 模式）
// 新增弹窗：在 ModalPropsMap 加 key 与 props 类型，再在 components/modals/registry.ts 注册组件

export interface ModalPropsMap {
  /** Bilibili 扫码登录弹窗（无 props） */
  QrLogin: undefined

  /** 手动搜索歌词弹窗 */
  ManualSearchLyrics: {
    /** 目标曲目 id（写歌词缓存与失效歌词 query 用） */
    trackId: number
    /** 初始搜索词（当前曲目名） */
    initialQuery: string
  }
}

export type ModalKey = keyof ModalPropsMap

export interface ModalInstance<K extends ModalKey = ModalKey> {
  key: K
  props: ModalPropsMap[K]
}
