// TanStack Query 客户端配置 + query key 集中管理
import { QueryClient } from '@tanstack/vue-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * auth 模块 query keys
 */
export const authQueryKeys = {
  userInfo: ['auth', 'userInfo'] as const,
}
