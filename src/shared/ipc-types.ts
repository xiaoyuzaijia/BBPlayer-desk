// IPC 请求/响应类型 + 共享业务类型（三端共享：主进程/preload/渲染进程）

/**
 * auth 模块错误码（IPC 边界用，主进程内部 BilibiliApiError 不跨 IPC）
 */
export type AuthErrorCode =
  | 'NETWORK'
  | 'BILIBILI_REJECTED'
  | 'QR_EXPIRED'
  | 'NOT_LOGGED_IN'
  | 'UNKNOWN'

/**
 * Result 包装类型：主进程 IPC handler 返回值统一用此类型
 * 替代 throw，错误信息结构化
 */
export type Result<T, E = AuthErrorCode> =
  | { ok: true; data: T }
  | { ok: false; error: { code: E; message: string } }

/**
 * B 站用户信息（getUserInfo IPC 返回）
 */
export interface BilibiliUserInfo {
  mid: number
  name: string
  face: string
  sign: string
}

/**
 * 主进程推送的登录态快照（auth:stateChanged）
 */
export interface AuthStateSnapshot {
  isLoggedIn: boolean
  userInfo: {
    mid?: number
    name?: string
    face?: string
    cachedAt?: number
  } | null
}

/**
 * 扫码状态机（auth:qrStatus 推送）
 * 注意：qrcodeKey 不暴露给渲染进程（敏感字段）
 */
export type QrStatus =
  | { state: 'generating' }
  | { state: 'polling'; url: string }
  | { state: 'scanned' }
  | { state: 'success' }
  | { state: 'expired' }
  | { state: 'error'; message: string }
