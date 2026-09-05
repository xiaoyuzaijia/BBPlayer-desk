// 歌词 mutations（TanStack Query）—— 手动搜索歌词弹窗用
//
// 包含：
// - useSearchLyricsMutation(): 按源 + 关键词搜索歌词（网易云 / 酷狗按钮触发，只拿元信息）
// - useFetchLyricsMutation(): 按选中结果获取歌词并写缓存，成功后失效 detail query
//
// 设计要点：
// - 搜索是用户显式触发（点按钮）而非响应式依赖，用 mutation 而非 query
//   （对应 BBPlayer useManualSearchLyrics 的手动 triggerSearch，桌面端简化为两按钮单源搜索）
// - fetchLyrics 成功后主进程已写入 userData/lyrics/{uniqueKey}.json，
//   这里失效 lyricQueryKeys.detail(trackId) → useLyricsQuery 重新拉取 → 播放页自动换词
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import type {
  LyricSearchResultItem,
  LyricSearchSource,
} from '../../../shared/ipc-types'
import { lyricQueryKeys } from '../queries/lyric/lyric'

// ─────────────────────────────────────────
// 1. useSearchLyricsMutation — 按关键词搜索歌词
// ─────────────────────────────────────────
export function useSearchLyricsMutation() {
  return useMutation({
    mutationKey: ['lyrics', 'searchLyrics'],
    mutationFn: async (params: { source: LyricSearchSource; keyword: string }) => {
      const res = await window.api.lyric.searchLyrics(params.source, params.keyword)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
  })
}

// ─────────────────────────────────────────
// 2. useFetchLyricsMutation — 按选中结果获取歌词并写缓存
// ─────────────────────────────────────────
export function useFetchLyricsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['lyrics', 'fetchLyrics'],
    mutationFn: async (payload: { trackId: number; item: LyricSearchResultItem }) => {
      // item 来自 vue-query 的 data ref（深响应式 Proxy），过 contextBridge / IPC 的
      // 结构化克隆会报 "An object could not be cloned"，先浅拷贝成纯对象
      const item: LyricSearchResultItem = { ...payload.item }
      const res = await window.api.lyric.fetchLyrics(payload.trackId, item)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    onSuccess: (_data, payload) => {
      // 失效该曲目的歌词 query → useLyricsQuery 重新拉取（读到新写的歌词文件 → 换词）
      void queryClient.invalidateQueries({
        queryKey: lyricQueryKeys.detail(payload.trackId),
      })
    },
  })
}
