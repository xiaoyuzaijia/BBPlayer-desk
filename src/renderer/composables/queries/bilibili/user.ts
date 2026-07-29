// B 站用户信息查询（TanStack Query）
//
// enabled: auth.isLoggedIn 控制未登录不发请求
// staleTime 24h，与 BBPlayer usePersonalInformation 一致
import { useQuery } from '@tanstack/vue-query'

import { useAuthStore } from '../../../stores/auth'

// ─────────────────────────────────────────
// query keys 就近导出
// ─────────────────────────────────────────
export const userQueryKeys = {
  userInfo: ['auth', 'userInfo'] as const,
}

export function useBilibiliUserInfo() {
  const auth = useAuthStore()
  return useQuery({
    queryKey: userQueryKeys.userInfo,
    queryFn: async () => {
      const res = await window.api.auth.getUserInfo()
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    enabled: () => auth.isLoggedIn, // 未登录不发请求
    staleTime: 1000 * 60 * 60 * 24, // 24h
  })
}
