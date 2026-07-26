import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// electron-vite 三端构建配置
// 入口文件路径遵循 docs/plan/后端计划.md 第 2.1 节目录约定：
//   src/main/index.ts       主进程入口（阶段 1 后续步骤创建）
//   src/preload/index.ts    preload 入口（阶段 1 后续步骤创建）
//   src/renderer/index.html 渲染进程入口（已就位）
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        // electron 必须外部化：否则 bundler 会内联 electron/index.js（含 getElectronPath 副作用），
        // __dirname 变成 out/main/ 导致 path.txt 找不到，触发重复下载
        external: ['electron'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        // electron 必须外部化：preload 中 import from "electron" 应使用 Electron 内置模块，
        // 而非 node_modules/electron/index.js（含 getElectronPath 副作用）
        external: ['electron'],
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    resolve: {
      alias: {
        // @/* 兼容现有 Vue 代码 import 习惯（当前代码全用相对路径，alias 备用）
        '@': resolve(__dirname, 'src/renderer'),
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [vue(), tailwindcss()],
  },
})
