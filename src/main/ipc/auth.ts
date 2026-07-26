// auth 模块 IPC handler
// 只负责注册 IPC 通道 + 调 bilibiliAuthFacade，不直接碰 bilibiliApi / appState
// 业务编排集中在 src/main/lib/facades/bilibiliAuth.ts
import { ipcMain, type BrowserWindow } from 'electron'

import { AUTH_CHANNELS } from '../../shared/ipc-channels'
import type {
  BilibiliUserInfo,
  Result,
} from '../../shared/ipc-types'
import { bilibiliAuthFacade } from '../lib/facades/bilibiliAuth'

export function registerAuthIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(AUTH_CHANNELS.loginWithQrCode, async (): Promise<Result<null>> => {
    bilibiliAuthFacade.startQrLogin(mainWindow)
    return { ok: true, data: null }
  })

  ipcMain.handle(AUTH_CHANNELS.cancelQrLogin, async (): Promise<Result<null>> => {
    bilibiliAuthFacade.cancelQrLogin()
    return { ok: true, data: null }
  })

  ipcMain.handle(AUTH_CHANNELS.logout, async (): Promise<Result<null>> => {
    bilibiliAuthFacade.logout(mainWindow)
    return { ok: true, data: null }
  })

  ipcMain.handle(
    AUTH_CHANNELS.getUserInfo,
    async (): Promise<Result<BilibiliUserInfo>> => {
      return bilibiliAuthFacade.fetchUserInfo(mainWindow)
    },
  )
}
