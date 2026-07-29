// 歌单 mutation hooks（TanStack Query useMutation）
//
// 包含：
// - useSyncRemotePlaylist: 同步远端歌单（mutation + 失效缓存）
// - useSyncProgress():     订阅同步进度推送（返回 ref，配合 useSyncRemotePlaylist 用）
//
// 设计要点（与 BBPlayer 对齐）：
// - mutation onSuccess 调 invalidateQueries 失效相关 query
// - useSyncProgress 用 ref 而不是 reactive，避免 render 中误用导致无限更新
// - 进度推送是全局的（所有同步任务共用一个 channel），通过 taskId 匹配当前正在同步的歌单
import { onUnmounted, ref, type Ref } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { playlistQueryKeys } from '../../queries/db/playlist'
import type {
  FavoriteSyncProgress,
  PlaylistType,
} from '../../../types/playlist'

// ─────────────────────────────────────────
// 1. useSyncProgress — 订阅同步进度推送
// ─────────────────────────────────────────
// 用法：组件 onMounted 调用一次，订阅期间 progress.value 实时更新
// mutation 完成 / 失败 / 组件卸载时自动 unsubscribe
//
// 与 useSyncRemotePlaylist 配合：mutation.mutate() 触发 → onSyncProgress 推送 → progress.value 更新
export function useSyncProgress(): Ref<FavoriteSyncProgress | null> {
  const progress = ref<FavoriteSyncProgress | null>(null)

  const unsubscribe = window.api.playlist.onSyncProgress((p) => {
    progress.value = p
  })

  onUnmounted(() => unsubscribe())

  return progress
}

// ─────────────────────────────────────────
// 2. useSyncRemotePlaylist — 同步远端歌单 mutation
// ─────────────────────────────────────────
// 入参：{ remoteSyncId, type }
// 成功后 invalidate all（覆盖 lists / detail / tracks）
// 进度由 useSyncProgress 单独订阅（mutation 不直接持有进度状态）
interface SyncRemoteArgs {
  remoteSyncId: number
  type: PlaylistType
}

export function useSyncRemotePlaylist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (args: SyncRemoteArgs): Promise<number | undefined> => {
      const res = await window.api.playlist.syncRemote(
        args.remoteSyncId,
        args.type,
      )
      if (!res.ok) throw new Error(res.error.message)
      // 返回 playlistId（主进程 facade 通过 remoteSyncId + type 找到本地记录）
      return res.data
    },
    onSuccess: () => {
      // 同步成功后失效所有 playlists/* 缓存：
      // - lists: 因为 itemCount / lastSyncedAt / coverUrl 都会变，新增歌单也会出现
      // - tracks: 远端曲目列表变化
      // - detail: 统计数据变化
      // 用 all prefix 一次失效整组（useLinkedPlaylist 是 computed，依赖 lists 缓存，失效后自动重算）
      void queryClient.invalidateQueries({ queryKey: playlistQueryKeys.all })
    },
  })
}
