// preload：通过 contextBridge 安全暴露主进程 API 给渲染进程
// 渲染进程通过 window.api.xxx() 调用，禁止直接用 ipcRenderer
import { contextBridge, ipcRenderer } from 'electron'

import { AUTH_CHANNELS, IMAGE_CHANNELS } from '../shared/ipc-channels'
import type {
  AuthStateSnapshot,
  BilibiliUserInfo,
  QrStatus,
  Result,
} from '../shared/ipc-types'

const api = {
  auth: {
    loginWithQrCode: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.loginWithQrCode) as Promise<Result<null>>,
    cancelQrLogin: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.cancelQrLogin) as Promise<Result<null>>,
    logout: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.logout) as Promise<Result<null>>,
    getUserInfo: () =>
      ipcRenderer.invoke(AUTH_CHANNELS.getUserInfo) as Promise<
        Result<BilibiliUserInfo>
      >,
    /**
     * 订阅扫码状态推送，返回 unsubscribe 函数
     * 组件 onUnmounted 调用避免内存泄漏
     */
    onQrStatus: (cb: (status: QrStatus) => void): (() => void) => {
      const handler = (_e: unknown, status: QrStatus): void => cb(status)
      ipcRenderer.on(AUTH_CHANNELS.qrStatus, handler)
      return () => ipcRenderer.off(AUTH_CHANNELS.qrStatus, handler)
    },
    /**
     * 订阅登录态变化推送，返回 unsubscribe 函数
     */
    onStateChanged: (cb: (snapshot: AuthStateSnapshot) => void): (() => void) => {
      const handler = (_e: unknown, snapshot: AuthStateSnapshot): void =>
        cb(snapshot)
      ipcRenderer.on(AUTH_CHANNELS.stateChanged, handler)
      return () => ipcRenderer.off(AUTH_CHANNELS.stateChanged, handler)
    },
  },
  image: {
    /**
     * 获取本地图片代理 server 端口
     * 渲染进程用 http://127.0.0.1:<port>/image?url=<encoded> 访问 B 站 CDN 图片
     */
    getProxyPort: () =>
      ipcRenderer.invoke(IMAGE_CHANNELS.getProxyPort) as Promise<number>,
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
