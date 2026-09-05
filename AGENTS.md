# AGENTS.md — BBPlayer-desk

学习项目：参考 BBPlayer（B 站音乐播放器），复刻其第三方数据获取与本地持久化逻辑。**架构为 Electron**——主进程承载所有"后端"逻辑（API client / SQLite / service / facade / cookie 管理 / 本地代理 server），渲染进程专注 UI（Vue 3 + Pinia + TanStack Query）。通过 CSS 自定义属性使用 MD3（Material Design 3）设计语言。

> **迁移计划**：详见 [docs/plan/](docs/plan/)。`src/main/lib/` 与 BBPlayer 的 `apps/mobile/src/lib/` 路径对齐以便 1:1 复刻。

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | electron-vite 三端 HMR（主/渲染/preload） |
| `pnpm build` | 三端构建 + electron-builder 打包 |
| `pnpm rebuild` | better-sqlite3 按 Electron 版本重编译 |
| `pnpm db:generate` / `pnpm db:push` | drizzle-kit 生成 / 应用迁移 |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 自动修复 |
| `pnpm typecheck` | vue-tsc 三端类型检查 |

务必使用 `pnpm`，不要用 npm 或 yarn。

## 技术栈

- **构建**：electron-vite（alex8088）+ electron-builder
- **主进程**：Electron + better-sqlite3（原生模块）+ drizzle-orm + undici + tough-cookie + neverthrow + fractional-indexing（歌单排序）
- **渲染进程**：Vue 3 `<script setup>` + TypeScript + Tailwind CSS v4 + Vue Router + Pinia + @tanstack/vue-query + @vueuse/core + @iconify/vue
- **Lint**：ESLint flat config（typescript-eslint strict + eslint-plugin-vue vue3-recommended）

## 项目结构

```
src/
├── main/                     # 主进程（Node 环境，"后端"逻辑）
│   ├── index.ts / window.ts # 启动入口 / BrowserWindow 创建
│   ├── ipc/                  # IPC handler，按模块分文件（auth / playlist / playback / lyric / bilibili / history / image）
│   ├── lib/                  # 与 BBPlayer apps/mobile/src/lib/ 路径对齐
│   │   ├── api/clients/      # API client 层（bilibili 主站 + netease / qqmusic / kugou 多源歌词）
│   │   ├── services/         # 单表 CRUD + *Sync 事务变体
│   │   ├── facades/          # 跨资源编排（扫码登录 / 收藏夹同步 / 播放解析 / 歌词 / 图片与音频代理）
│   │   ├── db/               # schema + migrations
│   │   ├── errors/ config/ utils/  # 错误类层次 / appState 单例 + cookie / log 与集合 diff 工具
│   └── types/bilibili.ts     # B 站 API 响应类型
├── preload/index.ts          # contextBridge 安全暴露主进程 API
├── shared/                   # 三端共享：ipc-channels / ipc-types
└── renderer/                 # 渲染进程（Vue 应用）
    ├── components/           # common / layout / player / playlist / lyric
    ├── views/ router/ stores/ types/
    ├── composables/          # useAudioEngine / useLyricSync + queries/（按数据源分目录）+ mutations/
    ├── utils/                # format / icons / imageUrl / lottie + splash/（歌词解析，带测试）
    └── lib/queryClient.ts    # TanStack Query 配置
```

`docs/plan/` 包含分阶段计划与调研报告。

## 架构：三进程 + 主进程四层

| 进程 | 环境 | 职责 |
|---|---|---|
| 主进程 `src/main/` | Node.js | 全部"后端"逻辑 + 模块级状态单例 |
| 渲染进程 `src/renderer/` | Chromium | Vue 应用、`<audio>` 播放、UI 组件 |
| preload `src/preload/` | 隔离 JS 环境 | contextBridge 安全暴露主进程 API |

严格隔离：contextIsolation 开、nodeIntegration 关，渲染进程只能通过 `window.api` 调主进程，不直接用 Node。

主进程四层（1:1 复刻 BBPlayer，依赖严格单向从下到上）：

1. **IPC handler 层**（`src/main/ipc/`）：把 facade/service 暴露给渲染进程；错误转 Result、Date 转 number
2. **facade 层**（`lib/facades/`）：跨资源业务编排（收藏夹同步 / 音频流解析 / 扫码登录 / 歌词匹配）；事务内不调网络
3. **service 层**（`lib/services/`）：单表 CRUD（Drizzle），屏蔽数据来源；提供事务注入与 *Sync 变体
4. **API client / DB 层**：纯 HTTP + WBI 签名 + cookie 注入，无业务；schema + better-sqlite3 + Drizzle + 迁移

## IPC 约定

- 通道名格式 `<module>:<action>`，常量集中在 [shared/ipc-channels.ts](src/shared/ipc-channels.ts)，**禁止字符串硬编码**
- 查询用 invoke（细粒度 handler），状态变更用主进程主动 push
- **Result 包装**：主进程内部用 neverthrow，跨 IPC 统一转 `{ ok, data | error }`
- **时间戳**：主进程内部用 Date，跨 IPC 转 number（ms epoch）
- **错误码映射**：内部错误类在 IPC handler 转成模块对应的 ErrorCode 枚举
- `Window.api` 类型从 [preload/index.ts](src/preload/index.ts) 导入，声明在 [renderer/types/ipc.d.ts](src/renderer/types/ipc.d.ts)
- 订阅推送返回 unsubscribe 函数，组件 onUnmounted 调用避免内存泄漏

## 状态管理

双层模型：主进程状态在 [lib/config/store.ts](src/main/lib/config/store.ts)（模块级单例，持久化到 userData/state.json）；渲染进程状态在 `renderer/stores/`（Pinia，只存 UI 状态与镜像，不放业务数据）。主进程变化时主动推给渲染进程订阅更新。

渲染进程 store 按职责切分（不写大而全的 store）：`auth`（登录镜像）、`player`（当前播放镜像）、`queue`（队列副本，removeAt 只返回信号由 playback 解释）、`playback`（播放控制）、`lyric`（歌词缓存）、`theme`（主题三态）。歌单列表不放 store，走 TanStack Query。

- 组件只调 `window.api.xxx()`，不直接 import 主进程模块
- 异步数据用 TanStack Query 包装，query keys 就近导出
- mutation 成功后 invalidateQueries 失效相关 query（用 prefix 失效整组）

## 数据库约定

- better-sqlite3（同步 API）+ drizzle-orm，与 BBPlayer 完全一致；DB 文件在 userData；启动时开 foreign_keys + WAL；迁移 drizzle-kit 生成、启动自动应用
- schema 在 [lib/db/schema.ts](src/main/lib/db/schema.ts)，7 张表：artists / tracks / playlists / playlistTracks / bilibiliMetadata / localMetadata / playHistory
- 时间戳统一 timestamp_ms（返回 JS Date）；playlistTracks 用 fractional-indexing 排序；tracks.uniqueKey 全局唯一，跨歌单复用曲目
- **事务**：better-sqlite3 事务是同步的（回调不能 await），facade 在事务内调 service 的 *Sync 变体；**事务内不调网络**

## B 站 API client 与本地代理

- HTTP 用 undici，无 CORS / 浏览器限制；UA / Referer 伪装 B 站 web 端
- cookie 用 tough-cookie 管理（每次请求前从 appState 同步）；WBI 签名用 Node 原生 crypto，无需第三方 md5 库
- 错误处理用 neverthrow ResultAsync，不 throw；多源歌词 client 在 `api/clients/`（netease / qqmusic / kugou）

B 站 CDN 有防盗链，主进程起两个本地代理 server（只监听 127.0.0.1，端口系统分配）：

- **imageProxy**（[lib/facades/imageProxy.ts](src/main/lib/facades/imageProxy.ts)）：转发图片，host 白名单校验
- **streamProxy**（[lib/facades/streamProxy.ts](src/main/lib/facades/streamProxy.ts)）：转发音频流，必须支持 Range，SSRF 防护拒绝私有 IP

音频 URL 在主进程解析并缓存（[lib/facades/playback.ts](src/main/lib/facades/playback.ts)），同一 trackId 并发请求去重；渲染进程 [useAudioEngine](src/renderer/composables/useAudioEngine.ts) 维护全局唯一 audio 元素，双向绑定 playback store。

## MD3 设计系统

MD3 令牌定义在 [renderer/style.css](src/renderer/style.css)（CSS 自定义属性，覆盖颜色/阴影/圆角/字阶/间距）。三套主题块：`:root`（亮）、`prefers-color-scheme: dark`（系统暗）、`[data-theme]`（用户显式覆盖，由 theme store 写入）。新增令牌时**三套主题块都要加**。Tailwind v4 不自动映射，class 中写 `bg-[var(--md-surface)]` 或用 @theme 映射成工具类。

## 代码约定

- 代码中写中文注释；写完后用中文简洁讲解
- Vue 3 `<script setup>` + 组合式 API，不用选项式；storeToRefs 解构 Pinia 状态；类型从 `types/` 导入，不从 `stores/`
- ESLint：未使用变量/参数用 `^_` 前缀；三元不能做语句；禁 `!` 非空断言；格式由 `pnpm lint:fix` 修复（无 Prettier）
- TypeScript `erasableSyntaxOnly` 开启：禁参数属性和 enum（用 const 对象 + 类型别名代替）
- 错误类层次：CustomError 派生 Service / Facade / Database / ThirdPartyError
- Drizzle 0.45+：查询用 `.sync()`；`.returning()` 后接 `.run()`
- 优先用 Edit 局部修改，不用 Write 整体重写；Edit 前先 Read 确认内容

## 路由与组件

- 路由链接用 `name` 不用 `path`；`() => import(...)` 懒加载
- 歌单详情按类型分 3 路由：`playlist-local/:id`（local + synced）、`playlist-favorite/:id`（B 站收藏夹）、`playlist-toview`（全局唯一，无 id）
- 组件目录：`common/`（IconButton / CoverPlaceholder / MD3Slider / MD3Switch / MD3Button）、`layout/`（Sidebar / NowPlayingBar）、`player/`（PlayerProgressBar / QueueDrawer）、`playlist/`（PlaylistHeader / TrackList / TrackListItem）、`lyric/`（LyricView / LyricLineItem）、`modals/`（ModalHost / QrLoginModal / ManualSearchLyricsModal，注册表 registry.ts）

## 已知陷阱

**渲染进程（Vue / CSS）**：

- NPB 外层 transform 使 fixed 后代以它为 containing block —— floating 队列抽屉必须 Teleport 到 body 跳出
- VueUse onClickOutside 的 ignore 类型是整个数组的 getter，不是元素级 getter
- useResizeObserver 首次读取宽度可能为 0，需 watch(open) 兜底
- 函数式 `:ref` 对子组件收到的是组件实例不是 DOM —— 从 `$el` 取根 DOM；mask-image 需同时写 `-webkit-mask-image` 兼容 WebKit

**主进程（Electron / Node）**：

- better-sqlite3 是原生 C++ 模块 —— 升级 Electron 后必须 `pnpm rebuild`；构建时 externalize（`electron` 与 `better-sqlite3` 都不打包进 main bundle，electron 不 externalize 会触发重复下载）
- 主进程崩溃 = 应用崩溃 —— 保持主进程简单，复杂业务放 facade
- 事务是同步的 —— callback 内不能 await，否则事务提前提交
- IPC 大数据量传输较慢 —— 分页加载
- 代理 server 只监听 127.0.0.1 —— 防 SSRF；streamProxy 需 host 白名单 + 拒绝私有 IP
- `app.requestSingleInstanceLock()` 防多开；macOS 未签名警告可忽略（学习项目）

## 参考项目

BBPlayer 位于 `E:\xiao_yu\Program\BBPlayer`，是设计参考。

**UI 模式参考**（渲染进程）：`apps/mobile/src/lib/theme/`（MD3 颜色映射）、`apps/mobile/src/hooks/stores/`（状态管理架构）、`apps/mobile/src/features/`（library / playlist / player 各模块，含歌词滚动与同步）、`apps/docs/docs/guides/playlist.md`（歌单需求文档）

**后端逻辑参考**（主进程，1:1 复刻）：`apps/mobile/src/lib/api/`（B 站 + 多源歌词 client）、`apps/mobile/src/lib/services/`（单表 CRUD）、`apps/mobile/src/lib/facades/`（跨资源编排）、`apps/mobile/src/lib/db/schema.ts`（表设计）、`apps/mobile/src/hooks/stores/useAppStore.ts`（cookie 状态机部分）

所有后端逻辑 1:1 复刻 BBPlayer，仅改 import 路径和 cookie 来源（Zustand → 模块级单例）。
