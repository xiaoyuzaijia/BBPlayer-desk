// 主进程入口
// 启动流程：appState.load() → initDb() → ensureDir() → startImageProxy() → startStreamProxy() → initPlaybackFacade() → initLyricFacade() → createWindow() → registerAllIpc()
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { appState } from './lib/config/store'
import { closeDb, initDb } from './lib/db'
import { registerAllIpc } from './ipc'
import { PLAYBACK_CHANNELS } from '../shared/ipc-channels'
import { bilibiliAuthFacade } from './lib/facades/bilibiliAuth'
import { initLyricFacade } from './lib/facades/lyric'
import { initPlaybackFacade } from './lib/facades/playback'
import { startImageProxy, stopImageProxy } from './lib/facades/imageProxy'
import { startStreamProxy, stopStreamProxy } from './lib/facades/streamProxy'
import { getLyricService } from './lib/services'

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

  // 确保歌词目录存在（userData/lyrics/）
  // 必须在 initLyricFacade 之前，否则首次 getLyrics 写文件会失败
  await getLyricService().ensureDir()

  // 启动本地图片代理 server（绕过 B 站 CDN 防盗链）
  // 端口由系统分配，渲染进程通过 IPC 查询
  await startImageProxy()

  // 启动本地音频流代理 server（绕过 B 站 CDN 防盗链 + 支持 Range）
  // 渲染进程 <audio> 走 http://127.0.0.1:<port>/stream?url=...
  const streamPort = await startStreamProxy()

  // 初始化 PlaybackFacade 单例（依赖 streamProxyPort）
  initPlaybackFacade(streamPort)

  // 初始化 LyricFacade 单例（依赖 lyricService，已在 ensureDir 时惰性创建）
  initLyricFacade()

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

  // ── 退出前保存播放会话（仅退出时存）──
  // 拦截 close：先请求渲染进程回传队列快照（playback:saveSessionRequest 推送 →
  // 渲染进程经 playback:saveSession invoke 回传 → ipc/playback.ts 写盘后 destroy 窗口）
  // sessionSaveState 三态：none=未开始 / pending=已请求（等待回传或兜底超时）/ done=放行
  let sessionSaveState: 'none' | 'pending' | 'done' = 'none'
  mainWindow.on('close', (e) => {
    if (sessionSaveState === 'done') return
    e.preventDefault()
    if (sessionSaveState === 'pending') return // 防重入：保存期间重复 close 只拦截
    sessionSaveState = 'pending'
    if (!mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(PLAYBACK_CHANNELS.saveSessionRequest)
    }
    // 兜底：渲染进程崩溃/无响应时 1s 后强制退出，保证关窗不被卡死（丢本次会话）
    setTimeout(() => {
      sessionSaveState = 'done'
      mainWindow.destroy() // 已被 saveSession handler 销毁时为 no-op
      app.quit()
    }, 1000)
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
