# AGENTS.md — BBPlayer-desk

学习项目：参考 BBPlayer（B 站音乐播放器），复刻其第三方数据获取与本地持久化逻辑。**架构为 Electron**——主进程承载所有"后端"逻辑（B 站 API client / SQLite / service / facade / cookie 管理 / 本地代理 server），渲染进程专注 UI（Vue 3 + Pinia + TanStack Query）。通过 CSS 自定义属性使用 MD3（Material Design 3）设计语言。

> **迁移计划**：详见 [docs/plan/](docs/plan/)。`src/main/lib/` 与 BBPlayer 的 `apps/mobile/src/lib/` 路径对齐以便 1:1 复刻。

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | electron-vite 三端 HMR（主/渲染/preload） |
| `pnpm build` | 三端构建 + `electron-builder` 打包 |
| `pnpm rebuild` | `@electron/rebuild`（better-sqlite3 按 Electron 版本编译） |
| `pnpm db:generate` / `pnpm db:push` | drizzle-kit 生成 / 应用迁移 |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 自动修复 |
| `pnpm typecheck` | `vue-tsc -b` 三端类型检查 |

务必使用 `pnpm`，不要用 npm 或 yarn。

## 技术栈

- **构建**：electron-vite（alex8088）+ electron-builder
- **主进程**：Electron + Node.js + `better-sqlite3`（原生模块）+ `drizzle-orm/better-sqlite3` + `undici`（Node 原生 fetch）+ `tough-cookie`（cookie jar）+ `neverthrow`（ResultAsync，与 BBPlayer 一致）+ `fractional-indexing`（歌单排序）
- **渲染进程**：Vue 3 `<script setup>` + TypeScript + Tailwind CSS v4（`@import "tailwindcss"`）+ Vue Router + Pinia + `@tanstack/vue-query`（异步缓存）+ @vueuse/core + @iconify/vue + vue3-lottie + @fontsource 字体
- **Node 原生能力**：`crypto`（WBI 签名 md5）、`http`（图片 / 音频流本地代理 server）、`fs`（state.json 持久化）
- **Lint**：ESLint flat config（typescript-eslint strict + eslint-plugin-vue vue3-recommended）

## 项目结构

```
src/
├── main/                              # 主进程（Node 环境，"后端"逻辑）
│   ├── index.ts                       # 启动入口：appState → initDb → proxies → facades → window → IPC
│   ├── window.ts                      # BrowserWindow 创建
│   ├── ipc/                           # IPC handler（按模块分文件）
│   │   ├── index.ts                   # registerAllIpc 入口
│   │   ├── auth.ts / playlist.ts / playback.ts / history.ts / image.ts
│   ├── lib/                           # 与 BBPlayer apps/mobile/src/lib/ 路径对齐
│   │   ├── api/clients/bilibili/      # API client 层（client / api / wbi / utils）
│   │   ├── services/                  # service 层（单表 CRUD + *Sync 事务变体）
│   │   ├── facades/                   # facade 层（跨资源编排 + imageProxy / streamProxy）
│   │   ├── db/                        # schema.ts + index.ts + migrations/
│   │   ├── errors/                    # 错误类层次（CustomError 派生 Service/Facade/Database/ThirdParty）
│   │   ├── config/                    # store.ts（appState 单例）+ cookie.ts
│   │   └── utils/                     # log.ts + set.ts（diffSets）
│   └── types/bilibili.ts              # B 站 API 响应类型
├── preload/index.ts                   # contextBridge.exposeInMainWorld('api', ...)
├── shared/                            # 三端共享：ipc-channels / ipc-types / index
└── renderer/                          # 渲染进程（Vue 应用，UI 侧）
    ├── components/ views/ router/ stores/ composables/ utils/ types/
    │   ├── composables/queries/       # TanStack Query 查询 hooks（按数据源分目录）
    │   └── composables/mutations/     # TanStack Query mutation hooks
    └── lib/queryClient.ts             # TanStack Query 配置
```

`docs/plan/` 包含分阶段计划与调研报告。

## 架构总览：三进程 + 主进程四层

### 三进程职责

| 进程 | 环境 | 职责 |
|---|---|---|
| **主进程** `src/main/` | Node.js | 所有"后端"逻辑：B 站 API client、SQLite + Drizzle、service / facade、cookie jar、图片 / 音频流本地代理、模块级状态单例 |
| **渲染进程** `src/renderer/` | Chromium | Vue 应用、Pinia（只存 UI 状态与镜像）、TanStack Query（异步缓存）、`<audio>` 播放、UI 组件 |
| **preload** `src/preload/` | 隔离 JS 环境 | `contextBridge.exposeInMainWorld('api', ...)` 安全暴露主进程 API |

严格隔离：`contextIsolation: true` + `nodeIntegration: false`，渲染进程**只能**通过 `window.api.xxx()` 调主进程，不直接用 Node。

### 主进程四层架构（1:1 复刻 BBPlayer，依赖严格单向从下到上）

```
┌─────────────────────────────────────────────────────────────┐
│  IPC handler 层    src/main/ipc/<module>.ts                 │
│  把 facade/service 暴露给渲染进程；错误→Result；Date→number  │
└──────────────┬──────────────────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────────────────┐
│  facade 层    src/main/lib/facades/                         │
│  跨资源业务编排（同步收藏夹 / 解析音频流 / 扫码登录）         │
│  事务内不调网络；事务内用 service *Sync 变体                 │
└──────────────┬──────────────────────────────────────────────┘
               │ 调用
┌──────────────▼──────────────────────────────────────────────┐
│  service 层    src/main/lib/services/                       │
│  单表 CRUD（Drizzle），屏蔽数据来源                          │
│  withDB(tx) 支持事务注入；*Sync 变体供 facade 在事务内调用   │
└──────────────┬──────────────────────────────────────────────┘
               │ 查询
┌──────────────▼──────────────────────────────────────────────┐
│  API client 层 / DB 层                                       │
│  api/clients/bilibili/：纯 HTTP + WBI 签名 + cookie 注入    │
│  db/：schema + better-sqlite3 + Drizzle + migrations        │
└─────────────────────────────────────────────────────────────┘
```

| 层 | 目录 | 职责 | BBPlayer 对应 |
|---|---|---|---|
| API client | `lib/api/clients/bilibili/` | 纯 HTTP + 签名 + cookie 注入，无业务 | `lib/api/bilibili/` |
| service | `lib/services/` | 单表 CRUD（Drizzle），屏蔽数据来源 | `lib/services/` |
| facade | `lib/facades/` | 跨资源业务编排（如"同步 B 站收藏夹到本地"），事务内不调网络 | `lib/facades/` |
| IPC handler | `ipc/<module>.ts` | 把 facade/service 暴露给渲染进程 | （BBPlayer 用 hooks 替代） |

## IPC 约定

- 通道名格式 `<module>:<action>`（如 `auth:loginWithQrCode` / `playlist:syncRemote` / `playback:getAudioUrl`）
- 通道名常量集中在 [shared/ipc-channels.ts](src/shared/ipc-channels.ts)，**禁止字符串硬编码**
- 查询用 `ipcRenderer.invoke`（细粒度 handler），状态变更用主进程 `webContents.send` 主动 push
- **IPC 边界 Result 包装**：主进程内部用 `neverthrow` ResultAsync，跨 IPC 时统一转 `{ ok: true, data } | { ok: false, error: { code, message } }`
- **时间戳序列化**：主进程内部用 `Date`，跨 IPC 统一转 `number`（ms epoch）
- **错误码映射**：主进程内部 `ServiceError / FacadeError / DatabaseError / BilibiliApiError` 在 IPC handler 转成模块对应的 ErrorCode 枚举（如 `PlaylistErrorCode`）
- preload 用 `contextBridge.exposeInMainWorld('api', {...})` 暴露，渲染进程通过 `window.api.xxx()` 调用
- `Window.api` 类型从 [preload/index.ts](src/preload/index.ts) 的 `Api` 导入，渲染进程声明在 [renderer/types/ipc.d.ts](src/renderer/types/ipc.d.ts)
- 订阅推送（如 `onSyncProgress` / `onQrStatus`）返回 unsubscribe 函数，组件 `onUnmounted` 调用避免内存泄漏

## 状态管理双层模型

| 层 | 位置 | 形式 | 职责 |
|---|---|---|---|
| 主进程状态 | `lib/config/store.ts` | 模块级单例（`class AppState`） | B 站 cookie / 用户信息 / 偏好，持久化到 `userData/state.json` |
| 渲染进程状态 | `renderer/stores/`（Pinia） | 组合式 store | UI 状态镜像（由主进程推送或 IPC 查询填充），不放业务数据 |

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

### 渲染进程数据获取约定

- 组件**只调 `window.api.xxx()`**，不直接 import 主进程模块
- 异步数据用 `@tanstack/vue-query` 包装（`useQuery` / `useMutation`），query keys 就近导出（在 `composables/queries/` 各文件内）
- mutation `onSuccess` 调 `invalidateQueries` 失效相关 query（用 prefix 一次失效整组）
- 渲染进程 Pinia store 只存 UI 状态和主进程状态镜像，**不放业务数据**（歌单列表走 TanStack Query）

## 数据库约定

- 用 `better-sqlite3`（同步 API）+ `drizzle-orm/better-sqlite3`，**与 BBPlayer 完全一致**
- DB 文件位置：`app.getPath('userData')/bbplayer-desk.db`
- 启动时 `pragma('foreign_keys = ON')` + `journal_mode = WAL` + `synchronous = NORMAL`
- schema 定义在 [lib/db/schema.ts](src/main/lib/db/schema.ts)，1:1 复刻 BBPlayer，7 张表：`artists` / `tracks` / `playlists` / `playlistTracks` / `bilibiliMetadata` / `localMetadata` / `playHistory`
- 时间戳统一 `timestamp_ms`（毫秒级 unixepoch，返回 JS Date）
- `playlistTracks` 用 `fractional-indexing` 排序，`sortKey` 越大越靠前（查询用 DESC）
- `tracks.uniqueKey` 全局唯一，跨歌单复用曲目
- 迁移用 `drizzle-kit generate` 生成 SQL，应用启动时自动应用
- **`better-sqlite3` 是原生 C++ 模块**：必须按 Electron 版本 rebuild（`@electron/rebuild`），[electron.vite.config.ts](electron.vite.config.ts) 中 `external: ['electron', 'better-sqlite3']` 不打包进 main bundle

### 事务与 *Sync 变体

better-sqlite3 事务是**同步**的（回调不能 `await`），但 facade 需要在事务内调 service。解决方案：

- service 提供 `withDB(conn)` 方法返回绑定新连接的实例
- service 提供 `*Sync` 变体方法（如 `findOrCreateArtistSync` / `replacePlaylistAllTracksSync`），同步执行不返回 ResultAsync
- facade 用 `db.transaction((tx) => { ... })` 包裹多步写操作，事务内调 `service.withDB(tx).*Sync(...)`
- **事务内不调网络**：网络请求在事务外完成，事务只负责原子写入

## B 站 API client 约定

- HTTP 用 `undici`（Node 原生 fetch 实现），**无 CORS 限制**
- UA / Referer / Origin 任意设（伪装 B 站 web 端），**无浏览器限制**
- cookie 用 `tough-cookie` 的 `CookieJar` 管理，每次请求前从 `appState.bilibiliCookie` 同步
- WBI 签名用 Node 原生 `crypto.createHash('md5')`，**无需第三方 md5 库**
- 错误处理用 `neverthrow` 的 `ResultAsync`，不 throw（与 BBPlayer 一致）

## 本地代理 server 约定

B 站 CDN 有防盗链，渲染进程 `<img>` / `<audio>` 不带 cookie/Referer 会 403。主进程起两个本地 HTTP server（都只监听 `127.0.0.1`，不暴露外网）：

| server | 文件 | 作用 |
|---|---|---|
| **imageProxy** | [lib/facades/imageProxy.ts](src/main/lib/facades/imageProxy.ts) | 转发 B 站图片，host 白名单 `i[0-2].hdslb.com`，渲染进程 `<img src="http://127.0.0.1:<port>/image?url=...">` |
| **streamProxy** | [lib/facades/streamProxy.ts](src/main/lib/facades/streamProxy.ts) | 转发 B 站音频流，host 白名单 `*.bilivideo.com/.cn / *.akamaized.net`，**必须支持 Range**（拖动进度条），透传 206 + Content-Range，SSRF 防护拒绝私有 IP |

端口由系统分配（避免冲突），渲染进程通过 IPC 查询。

## 音频流播放约定

B 站音频流 URL 在主进程解析（[PlaybackFacade](src/main/lib/facades/playback.ts)），但音频在渲染进程 `<audio>` 播放。流程：

1. 渲染进程调 `window.api.playback.getAudioUrl(trackId)`
2. PlaybackFacade 查 `bilibiliMetadata.audioStreamUrl` + `streamExpiresAt`，命中缓存（2h TTL，5min 安全余量）直接返回
3. 未命中调 `bilibiliApi.getAudioStream` → 写回 DB → 包装为 `http://127.0.0.1:<port>/stream?url=...`
4. 同一 trackId 并发请求去重（`pendingRequests` Map）

渲染进程 [useAudioEngine](src/renderer/composables/useAudioEngine.ts) 维护全局唯一 `HTMLAudioElement`，双向绑定 playback store。

## MD3 设计系统

所有 MD3 令牌定义在 [renderer/style.css](src/renderer/style.css) 中（CSS 自定义属性 `--md-*`，40+ 个令牌覆盖颜色/阴影/圆角/字阶/间距）。三套主题块：`:root`（亮）、`@media (prefers-color-scheme: dark)`（系统暗）、`[data-theme]`（用户显式覆盖，由 theme store 写入）。

Tailwind v4 不自动映射这些变量 —— class 中写 `bg-[var(--md-surface)]`，或用 `@theme` 块映射成工具类。新增令牌时**三套主题块都要加**。

## 代码约定

- 代码中写中文注释；写完后用中文简洁讲解
- Vue 3 `<script setup lang="ts">` + 组合式 API（`onMounted` / `watch` / `computed`），不用选项式
- `storeToRefs` 解构 Pinia 状态；类型从 `types/` 导入，不从 `stores/`
- **ESLint 规则**：未使用变量/参数用 `^_` 前缀忽略（tsc 的 noUnusedLocals 已关闭）；三元不能做语句；禁 `!` 非空断言
- **TypeScript 配置**：`erasableSyntaxOnly` 开启——**禁用参数属性**（constructor 必须显式赋值类字段）和 `enum`（用 const 对象 + 类型别名代替）
- 错误类层次：`CustomError` 派生 `ServiceError` / `FacadeError` / `DatabaseError` / `ThirdPartyError`，所有错误带 `{ type, data, cause }`
- Drizzle 0.45+：查询用 `.sync()`（同步 API），`insert/update/delete` 的 `.returning()` 后接 `.run()`

## 文件编辑约定

优先用 `Edit` 局部修改，不用 `Write` 整体重写（会丢失用户手动调整的代码）。`Edit` 前若不确定内容先 `Read` 确认，不要凭记忆构造 `old_string`。

## 路由约定

路由链接用 `name` 不用 `path`；`() => import(...)` 懒加载；Sidebar 用 `<router-link>` + Tailwind 激活态。

歌单详情页按类型分 3 个路由：`playlist-local/:id`（local + synced）、`playlist-favorite/:id`（B 站收藏夹）、`playlist-toview`（全局唯一，无 id）。

## 组件约定

- **common/** —— `IconButton`（MD3 图标按钮 + state-layer）、`CoverPlaceholder`（标题 hash → HSL 渐变 + 首字母）、`MD3Slider`、`MD3Switch`、`MD3Button`
- **layout/** —— `Sidebar`、`NowPlayingBar`、`QrLoginPanel`
- **player/** —— `PlayerProgressBar`（自绘 slider + 键盘 ±5s）、`QueueDrawer`（floating variant teleport 到 body 对齐 NPB / inline variant 对齐控制台）
- **playlist/** —— `PlaylistHeader`（120 封面 + 类型徽章 + 按 type 显隐操作按钮）、`TrackList`、`TrackListItem`
- **lyric/** —— `LyricView`（滚动容器）、`LyricLineItem`

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
- `electron` 本身也要 externalize —— 否则 bundler 内联 `node_modules/electron/index.js`（含 `getElectronPath` 副作用），`__dirname` 变成 `out/main/` 导致 `path.txt` 找不到，触发重复下载
- 主进程崩溃 = 应用崩溃 —— `app.on('render-process-gone')` 兜底；主进程逻辑保持简单，复杂业务放 facade
- better-sqlite3 事务是同步的 —— callback 内不能 `await`，否则事务提前提交；facade 在事务内调 `*Sync` 变体
- IPC 大数据量传输较慢 —— 分页加载，不要一次传 1000 首歌
- 本地代理 server 只监听 `127.0.0.1` —— 不暴露外网，否则有 SSRF 风险；streamProxy 需校验 host 白名单 + 拒绝私有 IP
- `app.requestSingleInstanceLock()` —— 防止多开，多开时第二个实例直接 `app.quit()`
- macOS 未签名应用显示"未验证开发者"警告 —— 学习项目可不签名
- Drizzle 0.45+ 的 better-sqlite3 适配器：`findMany` / `findFirst` 返回的是 query builder，需调 `.sync()` 才执行；`.returning()` 后接 `.run()`

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

- `apps/mobile/src/lib/api/bilibili/` —— B 站 API client（`client.ts` / `api.ts` / `wbi.ts` / `utils.ts`），迁移到 `src/main/lib/api/clients/bilibili/`
- `apps/mobile/src/lib/api/netease/` / `qqmusic/` / `kugou/` —— 多源歌词 API client
- `apps/mobile/src/lib/services/` —— 单表 CRUD（Drizzle），迁移到 `src/main/lib/services/`
- `apps/mobile/src/lib/facades/` —— 跨资源业务编排（收藏夹同步、外部歌单匹配），迁移到 `src/main/lib/facades/`
- `apps/mobile/src/lib/db/schema.ts` —— SQLite 表设计（Drizzle schema），1:1 复刻到 `src/main/lib/db/schema.ts`
- `apps/mobile/src/hooks/stores/useAppStore.ts`（bilibiliCookie 部分） —— cookie 状态机，迁移到 `src/main/lib/config/store.ts`
- `packages/splash/src/` —— 歌词解析纯函数（带测试），可直接复用到 `src/renderer/utils/lrcParser.ts`

所有 UI 模式（侧边栏、NPB、播放器、队列抽屉、歌词滚动）遵循 BBPlayer 的 MD3 样式约定。所有后端逻辑（API client / service / facade / DB schema）1:1 复刻 BBPlayer，仅改 import 路径和 cookie 来源（Zustand → 模块级单例）。
