// IPC 通道名常量（AGENTS.md 禁止字符串硬编码）
// 格式：<module>:<action>

export const AUTH_CHANNELS = {
  loginWithQrCode: 'auth:loginWithQrCode',
  cancelQrLogin: 'auth:cancelQrLogin',
  logout: 'auth:logout',
  getUserInfo: 'auth:getUserInfo',
  qrStatus: 'auth:qrStatus', // 主→渲染 推送
  stateChanged: 'auth:stateChanged', // 主→渲染 推送
} as const

export const IMAGE_CHANNELS = {
  getProxyPort: 'image:getProxyPort',
} as const
