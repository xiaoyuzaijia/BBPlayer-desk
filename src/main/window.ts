// BrowserWindow 创建与管理
// 参见 docs/plan/后端计划.md 第 4.2 节
import { BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { is } from '@electron-toolkit/utils'

// ESM 中 __dirname 未定义（package.json "type": "module"），
// 用 fileURLToPath(import.meta.url) + dirname() 推导等价路径。
// electron-vite 把 main bundle 输出到 out/main/index.js，
// 所以 __dirname 即 out/main/。
const __dirname = dirname(fileURLToPath(import.meta.url))

export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // preload 在 out/preload/index.js，从 out/main/ 上溯一级
      preload: join(__dirname, '..', 'preload', 'index.js'),
      sandbox: false, // 关闭 sandbox 以便 preload 后续使用 Node 集成
      contextIsolation: true, // 必须开，contextBridge 才能工作
      nodeIntegration: false, // 渲染进程不直接用 Node
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 外部链接用系统浏览器打开（防止在应用内导航到外部站点）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 开发模式加载 Vite dev server，生产加载打包文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // 生产：renderer 在 out/renderer/index.html
    mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  }

  return mainWindow
}
