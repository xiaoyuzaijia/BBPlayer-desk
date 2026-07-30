// 歌词查询 hooks（TanStack Query）—— 主进程 IPC 数据源
//
// 包含：
// - useLyricsQuery(trackId):  按 trackId 拉歌词文件数据（LyricFileData，含 lrc/tlyric/romalrc 字符串）
// - useClearLyricsMutation(): 清空所有歌词缓存（设置页"清除缓存"用）
//
// 设计要点（与 BBPlayer 对齐）：
// - query keys 就近导出（替代 lib/queryClient.ts 集中管理）
// - queryFn 解包 Result 类型，失败 throw Error（让 TanStack Query 进入 error 状态）
// - IPC 返回的是 SPL 字符串（lrc/tlyric/romalrc），渲染进程调 splash.parseAndMergeLyrics 解析
//   （不在 queryFn 解析，因为解析结果依赖多字段合并 + 行偏移调整，放 store computed 更灵活）
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toRef, type MaybeRefOrGetter } from 'vue'

import type { LyricFileData } from '../../../types/lyric'
import type { LyricSource } from '../../../../shared/ipc-types'

// ─────────────────────────────────────────
// query keys 就近导出
// ─────────────────────────────────────────
// 层级设计：[scope, resource, ...params]
// - all: ['lyrics'] 作为 prefix，便于 mutation 用 invalidateQueries({ queryKey: all }) 失效整组
// - detail(trackId): 单个 track 的歌词
export const lyricQueryKeys = {
  all: ['lyrics'] as const,
  detail: (trackId: number) => [...lyricQueryKeys.all, 'detail', trackId] as const,
}

// ─────────────────────────────────────────
// 1. useLyricsQuery — 按 trackId 拉歌词
// ─────────────────────────────────────────
// trackId 可传 ref / getter / number：变化时 queryKey 自动重算并重新查询
//
// staleTime 0：歌词文件可能被外部修改（手动删除/编辑），切歌时始终重新拉取
// 但因 queryKey 按 trackId 区分，同一 track 内不会重复拉取（keepPreviousData 默认行为）
//
// 注意：返回的 LyricFileData.lrc / tlyric / romalrc 是 SPL 字符串，
//       渲染进程需调 splash.parseAndMergeLyrics 解析为 LyricLine[]
export function useLyricsQuery(
  trackId: MaybeRefOrGetter<number | null>,
  source: LyricSource = 'auto',
) {
  const idRef = toRef(trackId)
  // queryKey 用 computed 包裹：idRef 变化时 queryKey 自动重算，vue-query 自动重新查询
  const queryKey = computed(() => lyricQueryKeys.detail(idRef.value ?? 0))
  return useQuery({
    queryKey,
    // IPC 返回 shared.LyricFileData，与 renderer LyricFileData 字段一致（结构兼容）
    queryFn: async (): Promise<LyricFileData> => {
      const res = await window.api.lyric.getLyrics(idRef.value ?? 0, source)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    // trackId 为 null 或 0（占位）时不发请求
    enabled: () => (idRef.value ?? 0) > 0,
    // 切歌时立即重新拉取，不用旧缓存
    staleTime: 0,
    // 切歌瞬间保留旧歌词显示，直到新歌词到达（避免闪烁）
    placeholderData: (prev) => prev,
  })
}

// ─────────────────────────────────────────
// 2. useClearLyricsMutation — 清空所有歌词缓存
// ─────────────────────────────────────────
// 设置页"清除缓存"用，成功后失效所有 lyrics query
// 失效后正在显示的歌词会重新拉取（但缓存已被清空，会重新走网络竞速）
export function useClearLyricsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<true> => {
      const res = await window.api.lyric.clearAllLyrics()
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    onSuccess: () => {
      // 失效所有 lyrics query（用 prefix 一次失效整组）
      void queryClient.invalidateQueries({ queryKey: lyricQueryKeys.all })
    },
  })
}
