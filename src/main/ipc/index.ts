// IPC handler 注册入口
// 后续模块（playlist / playback / lyric / history）在此追加
import type { BrowserWindow } from 'electron'

import { registerAuthIpc } from './auth'
import { registerImageIpc } from './image'

export function registerAllIpc(mainWindow: BrowserWindow): void {
  registerAuthIpc(mainWindow)
  registerImageIpc()
}
