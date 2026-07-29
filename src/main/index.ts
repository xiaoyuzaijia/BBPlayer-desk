// 主进程入口
// 启动流程：appState.load() → initDb() → startImageProxy() → startStreamProxy() → initPlaybackFacade() → createWindow() → registerAllIpc()
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { appState } from './lib/config/store'
import { closeDb, initDb } from './lib/db'
import { registerAllIpc } from './ipc'
import { bilibiliAuthFacade } from './lib/facades/bilibiliAuth'
import { initPlaybackFacade } from './lib/facades/playback'
import { startImageProxy, stopImageProxy } from './lib/facades/imageProxy'
import { startStreamProxy, stopStreamProxy } from './lib/facades/streamProxy'

// 单例锁（防止多开）
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.whenReady().then(async () => {
  // 读 state.json（cookie / userInfo / sendPlayHistory）
  appState.load()

  // 初始化 SQLite + 应用 migrations（必须在任何 service 调用前完成）
  initDb()

  // 启动本地图片代理 server（绕过 B 站 CDN 防盗链）
  // 端口由系统分配，渲染进程通过 IPC 查询
  await startImageProxy()

  // 启动本地音频流代理 server（绕过 B 站 CDN 防盗链 + 支持 Range）
  // 渲染进程 <audio> 走 http://127.0.0.1:<port>/stream?url=...
  const streamPort = await startStreamProxy()

  // 初始化 PlaybackFacade 单例（依赖 streamProxyPort）
  initPlaybackFacade(streamPort)

  const mainWindow = createWindow()
  registerAllIpc(mainWindow)

  // 渲染进程准备好后，主动推送一次初始登录态
  // 否则 auth store 初始 isLoggedIn=false，重启后即使 state.json 有 cookie 也显示未登录
  mainWindow.once('ready-to-show', () => {
    bilibiliAuthFacade.sendAuthStateChanged(mainWindow)
  })

  // 兜底：窗口关闭时停止扫码轮询（防止 timer 泄漏）
  mainWindow.on('closed', () => {
    bilibiliAuthFacade.cancelQrLogin()
  })

  // macOS：点击 Dock 图标时若无窗口则重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 非 macOS 平台关闭所有窗口后退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 应用退出时停止代理 server + 关闭数据库连接
app.on('before-quit', () => {
  stopImageProxy()
  stopStreamProxy()
  closeDb()
})
