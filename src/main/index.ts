// 主进程入口（阶段 1 最小版）
// 后续阶段会在此加入：appState.load() / initDb() / startAudioProxy() / registerAllIpc()
// 参见 docs/plan/后端计划.md 第 4.1 节
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'

// 单例锁（防止多开）
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.whenReady().then(() => {
  createWindow()

  // macOS：点击 Dock 图标时若无窗口则重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 非 macOS 平台关闭所有窗口后退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
