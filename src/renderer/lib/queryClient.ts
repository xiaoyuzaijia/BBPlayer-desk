// TanStack Query 客户端配置
//
// query keys 已就近导出到各 query 文件（与 BBPlayer 一致）：
// - composables/queries/db/playlist.ts → playlistQueryKeys
// - composables/queries/bilibili/user.ts → userQueryKeys
// - composables/queries/bilibili/favorite.ts → bilibiliFavoriteQueryKeys（收藏夹浏览）
// - composables/queries/lyric/lyric.ts → lyricQueryKeys（歌词查询）
//
// mutation 通过 import 同文件 keys 来 invalidate，不再集中定义
import { QueryClient } from '@tanstack/vue-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟
      refetchOnWindowFocus: false,
    },
  },
})
