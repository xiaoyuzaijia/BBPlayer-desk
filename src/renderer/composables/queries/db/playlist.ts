// 歌单查询 hooks（TanStack Query）—— DB 数据源
//
// 包含：
// - usePlaylists():        全部歌单列表
// - usePlaylistTracks(id): 单个歌单的曲目列表
// - useLinkedPlaylist():   按 (type, remoteSyncId) 反查已同步的本地 playlistId（computed）
//
// 设计要点（与 BBPlayer 对齐）：
// - query keys 就近导出（替代 lib/queryClient.ts 集中管理）
// - queryFn 解包 Result 类型，失败 throw Error（让 TanStack Query 进入 error 状态）
// - useLinkedPlaylist 不发新 IPC，复用 usePlaylists 缓存按 remoteSyncId 过滤（避免 N+1）
import { computed, toRef, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import type { Playlist, PlaylistType } from '../../../types/playlist'
import type { Track } from '../../../types/track'

// ─────────────────────────────────────────
// query keys 就近导出
// ─────────────────────────────────────────
// 层级设计：[scope, resource, ...params]
// - all: ['playlists'] 作为 prefix，便于 mutation 用 invalidateQueries({ queryKey: all }) 失效整组
// - lists(): 全部歌单列表
// - detail(id): 单个歌单元数据 + 统计
// - tracks(id): 歌单的曲目列表
export const playlistQueryKeys = {
  all: ['playlists'] as const,
  lists: () => playlistQueryKeys.all,
  detail: (id: number) => [...playlistQueryKeys.all, 'detail', id] as const,
  tracks: (id: number) => [...playlistQueryKeys.all, 'tracks', id] as const,
}

// ─────────────────────────────────────────
// 1. usePlaylists — 全部歌单列表
// ─────────────────────────────────────────
// staleTime 5min（queryClient 默认），与歌单列表低频变化特性匹配
export function usePlaylists() {
  return useQuery({
    queryKey: playlistQueryKeys.lists(),
    queryFn: async (): Promise<Playlist[]> => {
      const res = await window.api.playlist.getAll()
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
  })
}

// ─────────────────────────────────────────
// 2. usePlaylistTracks — 单个歌单的曲目列表
// ─────────────────────────────────────────
// 阶段 C 暂用一次性获取全量（tracks endpoint），不做游标分页
// 计划 §10 后续：大歌单（>500 首）改用 getTracksPaginated 游标分页
//
// playlistId 可传 ref / getter / number：变化时 queryKey 自动重算并重新查询
export function usePlaylistTracks(playlistId: MaybeRefOrGetter<number>) {
  const idRef = toRef(playlistId)
  // queryKey 用 computed 包裹：idRef 变化时 queryKey 自动重新计算
  // vue-query 监听 queryKey 变化，自动重新查询旧歌单 → 新歌单
  const queryKey = computed(() => playlistQueryKeys.tracks(idRef.value))
  return useQuery({
    queryKey,
    queryFn: async (): Promise<Track[]> => {
      const res = await window.api.playlist.getTracks(idRef.value)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    },
    // playlistId 为 0（占位）时不发请求
    enabled: () => idRef.value > 0,
    // 切走再切回时保留缓存 10 分钟，避免重新拉取
    staleTime: 1000 * 60 * 10,
  })
}

// ─────────────────────────────────────────
// 3. useLinkedPlaylist — 按 (type, remoteSyncId) 反查已同步的本地 playlistId
// ─────────────────────────────────────────
// 不发新 IPC，直接复用 usePlaylists() 缓存按 remoteSyncId 过滤
// 与 BBPlayer 模式一致（避免 N+1 查询）
//
// 返回 computed<number | null>：
// - null: 未同步 / type === 'local' / remoteSyncId <= 0
// - number: 已同步的本地 playlistId
export function useLinkedPlaylist(
  type: MaybeRefOrGetter<PlaylistType>,
  remoteSyncId: MaybeRefOrGetter<number>,
) {
  const typeRef = toRef(type)
  const idRef = toRef(remoteSyncId)
  const { data: allPlaylists } = usePlaylists()
  return computed<number | null>(() => {
    if (typeRef.value === 'local') return null
    if (idRef.value <= 0) return null
    const found = allPlaylists.value?.find(
      (p) => p.type === typeRef.value && p.remoteSyncId === idRef.value,
    )
    return found?.id ?? null
  })
}
