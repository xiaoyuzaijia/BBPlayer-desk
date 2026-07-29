// B 站收藏夹浏览查询 hooks（TanStack Query）—— 远端数据源
//
// 包含：
// - useFavoritePlaylists():         本人所有收藏夹列表
// - useFavoriteListContents(id):    收藏夹内容（无限分页，pn 从 1 开始，ps=40）
//
// 设计要点（与 BBPlayer useInfiniteFavoriteList 对齐）：
// - query keys 就近导出（bilibiliFavoriteQueryKeys）
// - queryFn 解包 Result 类型，失败 throw Error（让 TanStack Query 进入 error 状态）
// - 未登录时 enabled=false 不发请求
// - useFavoritePlaylists 过滤 [mp] 开头的分 P 收藏夹（与 BBPlayer 一致）
// - useFavoriteListContents 用 useInfiniteQuery，getNextPageParam 依据 has_more
import { computed, toRef, type MaybeRefOrGetter } from 'vue'
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query'

import { useAuthStore } from '../../../stores/auth'
import type {
  BilibiliFavoriteFolder,
  BilibiliFavoriteListContents,
} from '../../../types/bilibili'

// ─────────────────────────────────────────
// query keys 就近导出
// ─────────────────────────────────────────
// 层级设计：[scope, resource, ...params]
// - all: ['bilibili', 'favorite'] 作为 prefix
// - playlists(): 收藏夹列表
// - listContents(favoriteId): 收藏夹内容（无限分页，pn 在 queryFn 内递增）
export const bilibiliFavoriteQueryKeys = {
  all: ['bilibili', 'favorite'] as const,
  playlists: () => [...bilibiliFavoriteQueryKeys.all, 'playlists'] as const,
  listContents: (favoriteId: number) =>
    [...bilibiliFavoriteQueryKeys.all, 'listContents', favoriteId] as const,
}

// ─────────────────────────────────────────
// 1. useFavoritePlaylists — 本人所有收藏夹列表
// ─────────────────────────────────────────
// staleTime 5min（queryClient 默认）
// 过滤 [mp] 开头的分 P 收藏夹（与 BBPlayer 一致）
export function useFavoritePlaylists() {
  const auth = useAuthStore()
  return useQuery({
    queryKey: bilibiliFavoriteQueryKeys.playlists(),
    queryFn: async (): Promise<BilibiliFavoriteFolder[]> => {
      const res = await window.api.bilibili.getFavoritePlaylists()
      if (!res.ok) throw new Error(res.error.message)
      // 过滤分 P 收藏夹（标题以 [mp] 开头）
      return res.data.filter((f) => !f.title.startsWith('[mp]'))
    },
    enabled: () => auth.isLoggedIn, // 未登录不发请求
  })
}

// ─────────────────────────────────────────
// 2. useFavoriteListContents — 收藏夹内容（无限分页）
// ─────────────────────────────────────────
// 与 BBPlayer useInfiniteFavoriteList 对齐：
// - initialPageParam: 1（pn 从 1 开始）
// - getNextPageParam: lastPage.has_more ? lastPageParam + 1 : undefined
// - staleTime: 5 分钟
// - ps=40（B 站 API 硬编码，主进程 api.ts 固定）
//
// favoriteId 可传 ref / getter / number：变化时 queryKey 自动重算并重新查询
export function useFavoriteListContents(
  favoriteId: MaybeRefOrGetter<number>,
) {
  const idRef = toRef(favoriteId)
  const queryKey = computed(() =>
    bilibiliFavoriteQueryKeys.listContents(idRef.value),
  )
  return useInfiniteQuery({
    queryKey,
    queryFn: async (ctx): Promise<BilibiliFavoriteListContents> => {
      const pn = ctx.pageParam as number
      const res = await window.api.bilibili.getFavoriteListContents(
        idRef.value,
        pn,
      )
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.has_more ? lastPageParam + 1 : undefined,
    // favoriteId 为 0（占位）时不发请求
    enabled: () => idRef.value > 0,
    staleTime: 1000 * 60 * 5, // 5 分钟
  })
}
