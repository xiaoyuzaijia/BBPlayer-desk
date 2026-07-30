// IPC handler 注册入口
import type { BrowserWindow } from 'electron'

import { registerAuthIpc } from './auth'
import { registerBilibiliIpc } from './bilibili'
import { registerHistoryIpc } from './history'
import { registerImageIpc } from './image'
import { registerLyricIpc } from './lyric'
import { registerPlaybackIpc } from './playback'
import { registerPlaylistIpc } from './playlist'

export function registerAllIpc(mainWindow: BrowserWindow): void {
  registerAuthIpc(mainWindow)
  registerImageIpc()
  registerPlaylistIpc(mainWindow)
  registerPlaybackIpc()
  registerHistoryIpc()
  registerBilibiliIpc()
  registerLyricIpc()
}
