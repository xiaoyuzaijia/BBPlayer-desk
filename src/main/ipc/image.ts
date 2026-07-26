// image 模块 IPC handler
// 暴露本地图片代理 server 端口给渲染进程
import { ipcMain } from 'electron'

import { IMAGE_CHANNELS } from '../../shared/ipc-channels'
import { startImageProxy } from '../lib/facades/imageProxy'

export function registerImageIpc(): void {
  ipcMain.handle(IMAGE_CHANNELS.getProxyPort, async (): Promise<number> => {
    return startImageProxy() // 已启动则直接返回缓存端口
  })
}
