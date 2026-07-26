# AGENTS.md — BBPlayer-desk

## 项目说明

学习项目：参考 BBPlayer（B站音乐播放器），复刻其第三方数据获取与本地持久化逻辑。**架构为 Electron**——主进程承载所有"后端"逻辑（B 站 API client / SQLite / service / facade / cookie 管理），渲染进程专注 UI（Vue 3 + Pinia + TanStack Query）。通过 CSS 自定义属性使用 MD3（Material Design 3）设计语言。

> **迁移计划**：详见 [docs/plan/后端计划.md](docs/plan/后端计划.md)。`electron/main/lib/` 与 BBPlayer 的 `apps/mobile/src/lib/` 路径对齐以便 1:1 复刻。

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | electron-vite 三端 HMR（主/渲染/preload） |
| `pnpm build` | 三端构建 + `electron-builder` 打包 |
| `pnpm rebuild` | `@electron/rebuild`（better-sqlite3 按 Electron 版本编译） |
| `pnpm db:generate` / `pnpm db:push` | drizzle-kit 生成 / 应用迁移 |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 自动修复 |

务必使用 `pnpm`，不要用 npm 或 yarn。

## 技术栈

- **构建**：electron-vite（alex8088）+ electron-builder
- **主进程**：Electron + Node.js + `better-sqlite3`（原生模块）+ `drizzle-orm/better-sqlite3` + `undici`（Node 原生 fetch）+ `tough-cookie`（cookie jar）+ `neverthrow`（ResultAsync，与 BBPlayer 一致）
- **渲染进程**：Vue 3 `<script setup>` + TypeScript + Tailwind CSS v4（`@import "tailwindcss"`）+ Vue Router + Pinia + `@tanstack/vue-query`（异步缓存）+ @vueuse/core + @iconify/vue + vue3-lottie + @fontsource 字体
- **Node 原生能力**：`crypto`（WBI 签名 md5）、`http`（音频流本地代理 server）、`fs`（state.json 持久化）
- **Lint**：ESLint flat config（typescript-eslint strict + eslint-plugin-vue vue3-recommended）

## 项目结构

```
web_app/
├── electron/
│   ├── main/                      # 主进程（Node 环境，"后端"逻辑）
│   │   ├── index.ts               # app 启动入口
│   │   ├── window.ts              # BrowserWindow 创建
│   │   ├── ipc/                   # IPC handler（按模块分文件）
│   │   └── lib/                   # 与 BBPlayer apps/mobile/src/lib/ 路径对齐
│   │       ├── api/clients/       # bilibili / netease / qqmusic / kugou
│   │       ├── services/          # 单表 CRUD（Drizzle）
│   │       ├── facades/           # 跨资源业务编排
│   │       ├── db/                # schema.ts + index.ts（better-sqlite3）
│   │       ├── auth/              # cookieJar.ts + qrLogin.ts
│   │       ├── config/store.ts    # 模块级单例状态（替代 Zustand）
│   │       └── audio/streamProxy.ts  # 本地 HTTP server 代理音频流
│   ├── preload/index.ts           # contextBridge 暴露 API
│   └── shared/                    # 主/渲染共享：ipc-channels.ts + ipc-types.ts + types.ts
├── src/                           # 渲染进程（Vue 应用，UI 侧）
│   ├── components/ views/ router/ stores/ composables/ utils/ types/
│   └── lib/queryClient.ts         # TanStack Query 配置
├── electron.vite.config.ts
└── electron-builder.yml
```

`docs/plan/` 包含分阶段计划与调研报告。

## Electron 架构约定

### 三进程职责

| 进程 | 环境 | 职责 |
|---|---|---|
| **主进程** `electron/main/` | Node.js | 所有"后端"逻辑：B 站 API client、SQLite + Drizzle、service / facade、cookie jar、音频流本地代理、模块级状态单例 |
| **渲染进程** `src/` | Chromium | Vue 应用、Pinia（只存 UI 状态）、TanStack Query（异步缓存）、`<audio>` 播放、UI 组件 |
| **preload** `electron/preload/` | 隔离 JS 环境 | `contextBridge.exposeInMainWorld('api', ...)` 安全暴露主进程 API |

### 数据获取层分层（主进程内，1:1 复刻 BBPlayer）

依赖严格单向，从下到上：

| 层 | 目录 | 职责 | BBPlayer 对应 |
|---|---|---|---|
| API client | `lib/api/clients/<source>/` | 纯 HTTP + 签名 + cookie 注入，无业务 | `lib/api/bilibili/` 等 |
| service | `lib/services/` | 单表 CRUD（Drizzle），屏蔽数据来源 | `lib/services/` |
| facade | `lib/facades/` | 跨资源业务编排（如"同步 B 站收藏夹到本地"），事务内不调网络 | `lib/facades/` |
| IPC handler | `ipc/<module>.ts` | 把 facade/service 暴露给渲染进程 | （BBPlayer 用 hooks 替代） |

### IPC 通道约定

- 通道名格式 `<module>:<action>`，如 `auth:login` / `playlist:getAll` / `bilibili:syncFavoriteList`
- 通道名常量集中在 `electron/shared/ipc-channels.ts`，**禁止字符串硬编码**
- 查询用 `ipcRenderer.invoke`（细粒度 handler），状态变更用主进程 `webContents.send` 主动 push
- preload 用 `contextBridge.exposeInMainWorld('api', {...})` 暴露，渲染进程通过 `window.api.xxx()` 调用
- `Window.api` 类型从 `electron/preload/index.ts` 的 `Api` 导入，渲染进程声明在 `src/types/ipc.d.ts`

### 状态管理双层模型

| 层 | 位置 | 形式 | 职责 |
|---|---|---|---|
| 主进程状态 | `electron/main/lib/config/store.ts` | 模块级单例（`class AppState`） | B 站 cookie / 用户信息 / 偏好，持久化到 `userData/state.json` |
| 渲染进程状态 | `src/stores/`（Pinia） | 组合式 store | UI 状态镜像（由主进程推送或 IPC 查询填充），不放业务数据 |

主进程状态变化时主动 `webContents.send('<module>:stateChanged', ...)` 推给渲染进程，渲染进程在 Pinia store 里订阅更新。

### 渲染进程 Pinia store 切分

参考 BBPlayer 的 Zustand 架构，按"职责边界 + 数据真源位置"切分，**不写大而全的 store**。类型放 `types/`；派生态用 `computed`；组件中用 `storeToRefs` 解构状态。

| Store | 职责 | 真源 |
|---|---|---|
| `auth` | 登录状态镜像（用户信息 / isLoggedIn） | 主进程推送 + IPC 查询 |
| `player` | 当前播放镜像（`currentTrack` / `queueIndex`） | 镜像，由 playback 写入 |
| `queue` | 队列数据 + 增删改（UI 侧副本） | store 本身 + 主进程同步 |
| `playback` | 播放控制（`isPlaying` / `currentTime` / `volume` / `playMode` + actions） | store 本身 |
| `lyric` | 歌词缓存 + `currentLyricIndex`（二分查找） | `window.api.lyric.get` |
| `theme` | 主题三态（light/dark/system） | useStorage 持久化 |

`queue.removeAt` 不依赖 player store，只返回信号（`affectedIndex` / `shouldSwitchTrack` / `isEmpty`）由 playback 解释，保证 queue 可独立测试。**歌单列表不放 store**，走 TanStack Query。

### 数据库约定

- 用 `better-sqlite3`（同步 API）+ `drizzle-orm/better-sqlite3`，**与 BBPlayer 完全一致**
- DB 文件位置：`app.getPath('userData')/webapp.db`
- 启动时 `pragma('journal_mode = WAL')` + `pragma('synchronous = NORMAL')`
- schema 定义在 `electron/main/lib/db/schema.ts`，1:1 复刻 BBPlayer 的 `apps/mobile/src/lib/db/schema.ts`
- 迁移用 `drizzle-kit generate` 生成 SQL，应用启动时自动应用
- **`better-sqlite3` 是原生 C++ 模块**：必须按 Electron 版本 rebuild（`@electron/rebuild`），`electron.vite.config.ts` 中 `external: ['better-sqlite3']` 不打包进 main bundle

### B 站 API client 约定

- HTTP 用 `undici`（Node 原生 fetch 实现），**无 CORS 限制**
- UA / Referer / Origin 任意设（伪装 B 站 web 端），**无浏览器限制**
- cookie 用 `tough-cookie` 的 `CookieJar` 管理，每次请求前从 `appState.bilibiliCookie` 同步
- WBI 签名用 Node 原生 `crypto.createHash('md5')`，**无需第三方 md5 库**
- 错误处理用 `neverthrow` 的 `ResultAsync`，不 throw（与 BBPlayer 一致）

### 音频流播放约定

B 站音频流 URL 在主进程解析，但音频在渲染进程 `<audio>` 播放。**不能直接把 B 站 CDN URL 传给渲染进程**（Chromium 不带 cookie/Referer 会 403）。

解决方案：主进程起本地 HTTP server（`lib/audio/streamProxy.ts`，只监听 `127.0.0.1`），把 B 站音频流转发到 `http://127.0.0.1:<port>/stream?url=...`，主进程加 B 站 cookie/Referer/UA，渲染进程 `<audio>` 走本地 URL。

### 渲染进程数据获取约定

- 组件**只调 `window.api.xxx()`**，不直接 import 主进程模块
- 异步数据用 `@tanstack/vue-query` 包装（`useQuery` / `useMutation`），缓存 key 集中管理
- 渲染进程 Pinia store 只存 UI 状态和主进程状态镜像，**不放业务数据**（歌单列表走 TanStack Query）

## MD3 设计系统

所有 MD3 令牌定义在 `src/style.css` 中（CSS 自定义属性 `--md-*`，40+ 个令牌覆盖颜色/阴影/圆角/字阶/间距）。三套主题块：`:root`（亮）、`@media (prefers-color-scheme: dark)`（系统暗）、`[data-theme]`（用户显式覆盖，由 theme store 写入）。

Tailwind v4 不自动映射这些变量 —— class 中写 `bg-[var(--md-surface)]`，或用 `@theme` 块映射成工具类。新增令牌时**三套主题块都要加**。

## 代码约定

- 代码中写中文注释；写完后用中文简洁讲解
- Vue 3 `<script setup lang="ts">` + 组合式 API（`onMounted` / `watch` / `computed`），不用选项式
- `storeToRefs` 解构 Pinia 状态；类型从 `types/` 导入，不从 `stores/`
- **ESLint 规则**：未使用变量/参数用 `^_` 前缀忽略（tsc 的 noUnusedLocals 已关闭）；三元不能做语句；禁 `!` 非空断言

## 文件编辑约定

优先用 `Edit` 局部修改，不用 `Write` 整体重写（会丢失手动调整的像素值/样式）。`Edit` 前若不确定内容先 `Read` 确认，不要凭记忆构造 `old_string`。

## 路由约定

路由链接用 `name` 不用 `path`；`() => import(...)` 懒加载；Sidebar 用 `<router-link>` + Tailwind 激活态。

歌单详情页按类型分 3 个路由：`playlist-local/:id`（local + synced）、`playlist-favorite/:id`（B 站收藏夹）、`playlist-toview`（全局唯一，无 id）。预留 `/:pathMatch(.*)*` 404。

## 组件约定

- **common/** —— `IconButton`（MD3 图标按钮 + state-layer）、`CoverPlaceholder`（标题 hash → HSL 渐变 + 首字母）、`MD3Slider`、`MD3Switch`
- **player/** —— `PlayerProgressBar`（自绘 slider + 键盘 ±5s）、`QueueDrawer`（floating variant teleport 到 body 对齐 NPB / inline variant 对齐控制台）
- **playlist/** —— `PlaylistHeader`（120 封面 + 类型徽章 + 按 type 显隐操作按钮）、`TrackList`、`TrackListItem`
- **lyric/** —— `LyricView`（滚动容器）

## 已知陷阱

**渲染进程（Vue / CSS）**：

- NPB 外层 `.npb-wrap` 用了 `transform: translateX(-50%)` —— fixed 后代以此为 containing block，floating 队列抽屉必须 `<Teleport to="body">` 跳出
- VueUse `onClickOutside` 的 `ignore` 类型是 `MaybeRefOrGetter<(MaybeElementRef | string)[]>`（整个数组的 getter，不是元素级 getter）
- `useResizeObserver` 首次读取宽度可能为 0，需 `watch(open)` 兜底读 `offsetWidth`
- Vue 3 函数式 `:ref` 对**子组件**用时收到的是组件实例不是 DOM —— 从 `$el` 取根 DOM
- `mask-image` 需同时写 `-webkit-mask-image` 兼容 WebKit
- ESLint 配置在 `eslint.config.js`（flat config），未引入 Prettier —— 格式类规则由 `pnpm lint:fix` 自动修复

**主进程（Electron / Node）**：

- `better-sqlite3` 是原生 C++ 模块 —— 升级 Electron 版本后必须 `pnpm rebuild`，否则启动报错；`electron.vite.config.ts` 中 `external: ['better-sqlite3']` 不打包进 main bundle
- `contextIsolation: true` 必须开 —— preload 才能用 `contextBridge`；同时 `nodeIntegration: false`，渲染进程不直接用 Node
- 主进程崩溃 = 应用崩溃 —— `app.on('render-process-gone')` 兜底；主进程逻辑保持简单，复杂业务放 facade
- IndexedDB 事务一旦空闲就自动提交，不能等异步网络请求 —— BBPlayer 的"事务内嵌 API 调用"模式在 IndexedDB 上跑不起来，但 SQLite 事务可以（这是选 SQLite 而非 IndexedDB 的关键原因之一）
- IPC 大数据量传输较慢 —— 分页加载，不要一次传 1000 首歌
- 音频流本地代理 server 只监听 `127.0.0.1` —— 不暴露外网，否则有 SSRF 风险
- `app.requestSingleInstanceLock()` —— 防止多开，多开时第二个实例直接 `app.quit()`
- macOS 未签名应用显示"未验证开发者"警告 —— 学习项目可不签名

## 参考项目

BBPlayer 位于 `E:\xiao_yu\Program\BBPlayer`，是设计参考。

**UI 模式参考**（渲染进程）：

- `apps/mobile/src/lib/theme/material3Colors.ts` —— MD3 颜色映射
- `apps/mobile/src/hooks/stores/` —— 状态管理架构
- `apps/mobile/src/features/library/` —— 音乐库列表模式
- `apps/mobile/src/features/playlist/` —— 歌单详情页
- `apps/mobile/src/features/player/components/PlayerLyrics.tsx` —— 歌词滚动容器（活动行偏上、`MaskedView` 淡出、手动/自动跟随区分）
- `apps/mobile/src/features/player/hooks/useLyricSync.ts` —— 歌词同步（用户拖动 2 秒防抖）
- `apps/docs/docs/guides/playlist.md` —— 歌单需求文档

**后端逻辑参考**（主进程，1:1 复刻）：

- `apps/mobile/src/lib/api/bilibili/` —— B 站 API client（`client.ts` / `api.ts` / `wbi.ts` / `utils.ts`），迁移到 `electron/main/lib/api/clients/bilibili/`
- `apps/mobile/src/lib/api/netease/` / `qqmusic/` / `kugou/` —— 多源歌词 API client
- `apps/mobile/src/lib/services/` —— 单表 CRUD（Drizzle），迁移到 `electron/main/lib/services/`
- `apps/mobile/src/lib/facades/` —— 跨资源业务编排（收藏夹同步、外部歌单匹配），迁移到 `electron/main/lib/facades/`
- `apps/mobile/src/lib/db/schema.ts` —— SQLite 表设计（Drizzle schema），1:1 复刻到 `electron/main/lib/db/schema.ts`
- `apps/mobile/src/hooks/stores/useAppStore.ts`（bilibiliCookie 部分） —— cookie 状态机，迁移到 `electron/main/lib/config/store.ts` + `electron/main/lib/auth/`
- `packages/splash/src/` —— 歌词解析纯函数（带测试），可直接复用到 `src/utils/lrcParser.ts`

所有 UI 模式（侧边栏、NPB、播放器、队列抽屉、歌词滚动）遵循 BBPlayer 的 MD3 样式约定。所有后端逻辑（API client / service / facade / DB schema）1:1 复刻 BBPlayer，仅改 import 路径和 cookie 来源（Zustand → 模块级单例）。
