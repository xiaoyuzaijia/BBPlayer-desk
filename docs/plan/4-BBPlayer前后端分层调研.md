---
title: BBPlayer 前端分层调研报告
description: 基于 BBPlayer 源码的前端与三方数据获取分层分析,给出 web_app 的演进建议
date: 2026-07-20
---

## 0. 调研目标与结论速览

**问题**:BBPlayer 是 MonoRepo 结构,但没有在 package 级别明确做前后端分离。忽略 BBPlayer 自己的云后端(需求少且在建),单从前端 / 三方数据获取这两者的分离来说,大概可以怎么划分层次?

**核心结论**:

1. BBPlayer 的业务逻辑 **全部塞在 `apps/mobile/src/` 内**,在 package 级别没有把"前端"和"三方数据获取"分开,只是用目录做了 5 层隔离(`api/clients → services → facades → hooks/queries → components`)。
2. B 站 API 调用通过 `apps/mobile/src/lib/api/bilibili/` 三个文件(`client.ts` / `api.ts` / `wbi.ts`)直接从客户端发起,**无任何 server-side 代理**。
3. 数据获取走三层架构:`组件 → hooks/queries/mutations → facades → {services, api clients} → SQLite / 远端 HTTP`,TanStack Query 负责缓存,Zustand 只管 UI 状态。
4. web_app 当前已具备"类型 + 假数据 + 状态切片 + UI"四层雏形,差距集中在:**API/Service 层完全空白、Composables 层严重不足、playback store 编排接近边界**。

> web_app **不做云后端**,采用 Electron 架构,主进程承载所有第三方数据获取与本地持久化逻辑(1:1 复刻 BBPlayer),渲染进程专注 UI。具体规划见 [后端计划.md](./后端计划.md)。

---

## 1. BBPlayer 顶层结构

BBPlayer 是 pnpm monorepo(`package.json` 中 `workspaces: ["apps/*", "packages/*"]`),4 个 app + 10 个 package。

### 1.1 apps/

| 路径 | 职责 | 技术栈 |
|---|---|---|
| `apps/mobile` | React Native 移动端核心应用 | Expo 57 + Drizzle ORM + Zustand + TanStack Query + React Native Paper (MD3) |
| `apps/docs` | 文档站点 | VitePress |
| `apps/update-publisher` | 发布更新 manifest 的命令行工具 | TypeScript + tsx |

**注意**:不存在 `apps/web` / `apps/desktop`。BBPlayer 是"local-first 移动应用",核心代码全部在 `apps/mobile`。

### 1.2 packages/

| 路径 | 用途 | 使用方 |
|---|---|---|
| `packages/orpheus` | 音频播放引擎(基于 Android Media3 / iOS AVPlayer 的 Expo 原生模块),内部自带 Bilibili API 的 Kotlin/Swift 实现 | mobile |
| `packages/splash` | 歌词解析与转换核心库(纯 TS,含测试) | mobile |
| `packages/native` | BBPlayer 通用原生能力集成 | mobile |
| `packages/logs` | 日志库(多 transport) | mobile |
| `packages/heatmap` | SVG 日期热力图组件 | mobile |
| `packages/image-theme-colors` | 从图片提取主题色的原生模块 | mobile |
| `packages/expo-wavy-slider` | Jetpack Compose 波形滑动条的 Expo 封装 | mobile |
| `packages/bottom-tabs-react-navigation` | 原生底部 tab 与 React Navigation 桥接 | mobile |
| `packages/react-native-bottom-tabs` | 跨平台原生底部 tab 组件 | mobile |
| `packages/eslint-plugin` | 项目自定义 ESLint 规则 | dev |

**关键观察**:除 `packages/splash`(纯 TS 理论可前后端共用,目前只在 mobile 用)和 `packages/eslint-plugin` 外,后端不依赖任何 package,只用 npm 公共依赖。BBPlayer 没有把"B 站 API client"抽成共享 package,导致 `packages/orpheus` 的 Kotlin/Swift 又重写了一遍 B 站 API —— 这是没在 package 级别分离的代价。

---

## 2. BBPlayer 数据获取层

### 2.1 B 站 API 调用 —— 纯前端,无代理

B 站 API 调用全部在 `apps/mobile/src/lib/api/bilibili/` 下,分 5 个文件:

| 文件 | 职责 |
|---|---|
| `client.ts` | `ApiClient` 类,封装 `fetch`,内部从 `useAppStore.getState().bilibiliCookie` 读取 cookie 并手动注入 `Cookie` header,默认带 `User-Agent`/`Referer`/`Origin` 三件套伪装成 B 站 web 端。导出单例 `bilibiliApiClient`。返回值用 `neverthrow` 的 `ResultAsync` 而非 throw |
| `api.ts` | `BilibiliApi` 类,把所有 B 站接口封装成方法(`getHistory`、`getFavoritePlaylists`、`getAudioStream`、`searchVideos`、`getComments`、`thumbUpVideo`、`getLoginQrCode` 等 30+ 个)。导出单例 `bilibiliApi` |
| `wbi.ts` | WBI 签名算法实现(img_key/sub_key 混淆 + md5 + wts 时间戳),`wbi_keys` 缓存在 MMKV 中每日刷新 |
| `utils.ts` | `bv2av`/`av2bv` 转换、CSRF token 提取等纯函数 |
| `proto/dm.proto` | 弹幕 protobuf 定义,构建时由 `pbjs` 编译成 `dm.js` |

`apps/mobile/src/lib/api/bilibili/client.ts` 第 30-58 行的核心实现:

```ts
class ApiClient {
    private baseUrl = 'https://api.bilibili.com'
    private request = <T>({ endpoint, options, fullUrl, skipCookie }) => {
        const url = fullUrl ?? `${this.baseUrl}${endpoint}`
        const cookieList = useAppStore.getState().bilibiliCookie
        const cookie = cookieList && !skipCookie ? serializeCookieObject(cookieList) : ''
        const defaultHeaders = {
            Cookie: cookie,
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 ...) BiliApp/6.66.0',
            Referer: 'https://www.bilibili.com/',
            Origin: 'https://www.bilibili.com',
        }
        // ...
        credentials: 'omit',  // 显式忽略 RN 自动 cookie jar
```

**没有 server-side 代理**:搜索未发现 Next.js API routes、Nitro、自定义代理 server 等任何转发逻辑。所有 B 站请求都是 mobile 客户端直连 `api.bilibili.com` / `passport.bilibili.com` / `s.search.bilibili.com`。

### 2.2 鉴权(Cookie / SESSDATA)处理 —— 前端管理

- Cookie 完全在前端管理:`useAppStore`(`apps/mobile/src/hooks/stores/useAppStore.ts`)通过 Zustand + `persist` + MMKV 存储 `bilibiliCookie` 对象。
- 三种登录方式:
  - **扫码登录**(`getLoginQrCode` + `pollQrCodeLoginStatus`):轮询 passport.bilibili.com,从 `Set-Cookie` header 解析 cookie 字符串
  - **短信验证码登录**(`sendPhoneLoginSms` + `loginWithPhoneSmsCode`)
  - **手动设置 cookie**(`setBilibiliCookie`):用户粘贴 cookie 字符串,通过 `CookieLoginModal` 组件输入
- Cookie 同步给原生播放引擎:`setBilibiliCookie` 中调用 `Orpheus.setBilibiliCookie(serializeCookieObject(cookieObj))`,让 orpheus 的 Kotlin/Swift BilibiliRepository 也能用同一份 cookie 直接请求音频流 URL
- CSRF token:`postWithCsrf` 通过 `getCsrfToken()` 从 cookie 中提取 `bili_jct` 自动附加到 POST body

---

## 3. BBPlayer 状态管理与数据缓存

### 3.1 Zustand stores(`apps/mobile/src/hooks/stores/`)

| Store | 职责 |
|---|---|
| `useAppStore` | bilibili cookie、用户信息、全局设置(播放器样式/歌词源/数据收集开关等),持久化到 MMKV |
| `usePlayerStore` | 播放器状态(当前曲目、队列、播放模式) |
| `useDownloadManagerStore` | 下载任务状态 |
| `useExternalPlaylistSyncStore` | 外部歌单(网易云/QQ)同步状态 |
| `useModalStore` | 全局 modal 注册表 |
| `usePlayerQueueSheetStore` | 播放队列抽屉 UI 状态 |
| `useSharedPlaylistMembersStore` | 共享歌单成员缓存(内存) |
| `useSkinStore` | 主题皮肤 |

Store 切分粒度按"职责边界",而非大而全。组件中通过 `useAppStore((s) => s.xxx)` 选择性订阅。

### 3.2 TanStack Query(React Query v5)

`apps/mobile/src/lib/config/queryClient.ts` 配置全局 QueryClient,默认 retry 2 次,QueryCache 集中处理错误(检测 `-101` 登录失效 → 跳转到登录页)。

数据获取分两个目录:

**`hooks/queries/`** —— 只读查询
- `bilibili/{comments,danmaku,favorite,search,theme,user,video}.ts` —— 调 `bilibiliApi`
- `db/{playlist,track}.ts` —— 调本地 SQLite(`playlistService`/`trackService`)
- `lyrics/index.ts`, `orpheus/index.ts`, `external-playlist/`, `playHistory.ts`, `sharedPlaylist*.ts`

**`hooks/mutations/`** —— 写入操作
- `bilibili/{comments,favorite,video}.ts` —— 调 `bilibiliApi` 的 POST 接口
- `db/{playlist,track}.ts` —— 本地 DB 写入
- `lyrics/index.ts`, `orpheus/index.ts`

示例(`hooks/queries/bilibili/favorite.ts`):

```ts
export const useInfiniteFavoriteList = (favoriteId?: number) => {
    const hasCookie = useHasCookie()
    const enabled = hasCookie && !!favoriteId
    return useInfiniteQuery({
        queryKey: favoriteListQueryKeys.infiniteFavoriteList(favoriteId),
        queryFn: ({ pageParam, signal }) =>
            returnOrThrowAsync(
                bilibiliApi.getFavoriteListContents({ favoriteId: favoriteId!, pn: pageParam, signal }),
            ),
        enabled,
        initialPageParam: 1,
        getNextPageParam: (lastPage, _allPages, lastPageParam) =>
            lastPage.has_more ? lastPageParam + 1 : undefined,
        staleTime: 5 * 60 * 1000,
    })
}
```

### 3.3 数据流向(三层架构)

```
组件 → hooks(queries/mutations) → facades(编排) → services(单表 CRUD) + api clients(B 站) → SQLite / 远端 HTTP
```

不存在"组件直接调 API"或"store 直接调 API"的写法。Store 只存状态,数据获取完全走 React Query。

---

## 4. BBPlayer 业务逻辑归属

### 4.1 写在前端的逻辑

| 功能 | 落点 | 关键文件 |
|---|---|---|
| B 站 API 调用 + WBI 签名 | `lib/api/bilibili/` | `api.ts`, `client.ts`, `wbi.ts` |
| 视频转音频流 URL | 前端 `BilibiliApi.getAudioStream` 中决定 `dolby > hi-res > normal` 优先级 | `api.ts` 第 401-528 行 |
| 歌单解析(收藏夹/合集/UP 主投稿/多 P) | 前端 facade 协调 B 站 API + 本地 DB | `lib/facades/bilibili.ts`, `syncBilibiliPlaylist.ts` |
| 用户信息获取 | 前端直调 B 站 `getOtherUserInfo`/`getUserInfo` | `api.ts` |
| 收藏夹同步到本地 | 前端 facade | `lib/facades/syncBilibiliPlaylist.ts` |
| 外部歌单(网易云/QQ 音乐)匹配 B 站 | 前端 facade + 第三方 API client | `lib/facades/syncExternalPlaylist.ts`, `lib/api/{netease,qqmusic,kugou}/` |
| 歌词获取(多源匹配) | 前端 service + 纯函数解析 | `lib/services/lyricService.ts`, `packages/splash` |
| 本地 SQLite CRUD | service 层 | `lib/services/{playlistService,trackService,artistService}.ts` |
| 弹幕解码(protobuf) | 前端 | `api.ts` `getSegDanmaku` + `proto/dm.proto` |
| 播放/下载/通知栏 | orpheus 原生模块(Kotlin/Swift) | `packages/orpheus/android/.../orpheus/bilibili/` |
| 主题/皮肤系统 | 前端 | `lib/theme/` |

### 4.2 可独立测试的纯逻辑模块

- `packages/splash` —— 歌词解析/合并/时间换算,带 `__tests__/` 与 fixtures,纯 TS 无 RN 依赖
- `apps/mobile/src/lib/api/bilibili/wbi.ts` —— WBI 签名算法(`mixinKeyEncTab` 打乱 + md5)
- `apps/mobile/src/lib/api/bilibili/utils.ts` —— `bv2av`/`av2bv` 算法
- `apps/mobile/src/lib/services/*` —— 基于 Drizzle ORM 的 service 类,接受 `db` 参数注入,可在测试中替换为内存 SQLite
- `apps/mobile/src/utils/` —— `time.ts`、`color.ts`、`search.ts`、`matching.ts` 等工具
- `packages/orpheus/android/.../bilibili/{BilibiliApi.kt,WbiUtil.kt}` —— 原生侧的 B 站 API 与 WBI 签名(Kotlin),供 orpheus 模块独立使用

---

## 5. BBPlayer 的实际分层小结

综合以上,BBPlayer 名义上是 monorepo,但**业务逻辑全部塞在 `apps/mobile/src/` 里**,内部分了 5 层目录:

| 层 | 目录 | 职责 |
|---|---|---|
| API client | `lib/api/bilibili/` | 纯 HTTP + WBI 签名 + cookie 注入 |
| Service | `lib/services/` | 单表 CRUD(本地 SQLite) |
| Facade | `lib/facades/` | 跨资源业务编排 |
| Data hooks | `hooks/queries/` + `hooks/mutations/` | TanStack Query 缓存层 |
| UI | `components/` + `features/` | 纯渲染 |

它**没把"前端"和"三方数据获取"在 package 级别分开**,只是在 app 内部用目录隔离。

---

## 6. web_app 当前分层现状

### 6.1 总览结论

- 项目当前**完全运行在假数据上**,零网络调用(`fetch` / `axios` / `XMLHttpRequest` / 环境变量 / `http(s)://` 均无匹配),未来接 API 只需改 `data/` 两个文件,这是 AGENTS.md 中"假数据层"约定的明确设计意图
- **分层骨架已搭好**:`types/ → data/ → stores/ → composables → components/views`,方向是单向的;没有任何 component 直接 `import` `data/`,全部经 store 中转(grep 验证)
- **状态管理切片合理**:6 个 store 按"职责边界 + 数据真源位置"切分,与 AGENTS.md 表格完全一致;跨 store 编排集中在 `playback`,`lyric` 也做了次级订阅
- 主要差距在:**缺 API/Service 层、缺异步数据获取/缓存层(无 TanStack Query 之类)、缺 hook 层封装**。`playback` 已显式承担编排职责,目前规模可控(约 160 行),但再加异步/媒体元数据后会膨胀

### 6.2 目录结构总览

`src` 下一级目录:

| 目录 | 文件数 | 职责 |
|---|---|---|
| `assets/` | lottie 动画 json 3 个 | 静态资源(`play-pause.json` / `skip-prev.json` / `skip-next.json`) |
| `components/` | 12 个 `.vue`,按 5 个子域切分 | 通用 UI + layout + player + playlist + lyric |
| `composables/` | 1 个 | 仅 `usePlaybackProgress.ts`(每秒 +1s 定时器) |
| `data/` | 2 个 | 假数据层(`playlists.ts` / `lyrics.ts`),未来接 API/IndexedDB 只改这里 |
| `router/` | 1 个 | Vue Router 5 配置,8 条路由 |
| `stores/` | 6 个 | Pinia store,按职责切分(player/queue/playback/playlist/lyric/theme) |
| `types/` | 3 个 | 类型定义,与 store 解耦(`track.ts` / `playlist.ts` / `lyric.ts`) |
| `utils/` | 4 个 | 纯函数工具(`icons.ts` / `format.ts` / `lottie.ts` / `lrcParser.ts`) |
| `views/` | 6 个 | 路由页面 |
| 根文件 | `App.vue` / `main.ts` / `style.css` / `shims-fonts.d.ts` | 入口与全局样式 |

`components/` 子域划分:

```
components/
├── common/      IconButton / CoverPlaceholder / MD3Slider / MD3Switch(4 个)
├── layout/      Sidebar / NowPlayingBar(2 个)
├── lyric/       LyricView / LyricLineItem(2 个)
├── player/      PlayerProgressBar / QueueDrawer(2 个)
└── playlist/    PlaylistHeader / TrackList / TrackListItem(3 个)
```

### 6.3 数据获取层现状

#### `data/` 文件清单与导出方式

**`src/data/playlists.ts`**

- 顶部声明:`// 假数据层:未来接入 API / IndexedDB 时,只改这个文件`
- 导出方式:`export const fakePlaylists: Playlist[] = [...]`,模块级常量数组,直接初始化好
- 内含 7 个 `Playlist` 假数据:3 个 `local` + 1 个 `synced` + 2 个 `favorite` + 1 个 `toview`,共 17 首 `Track`
- 每条 `Track` 由工厂函数 `makeTrack()` 生成,`coverUrl: ''` 故意留空触发 `CoverPlaceholder` 占位符

**`src/data/lyrics.ts`**

- 顶部声明:`// 假数据层:未来接入 API / IndexedDB 时,只改这个文件`
- 导出方式:`export function getLyricByTrackId(trackId: string): LyricFile | null`,**函数式查询入口**而非直接导出常量
- 内部维护 `rawLyrics: Record<string, RawLyric>` 字典(仅 2 首歌:`l1-t1` 带翻译、`l1-t2` 无翻译),用 `Map<string, LyricFile>` 缓存解析结果,调用 `parseLrc` + `mergeLyrics` 完成解析合并
- 这种"函数式查询入口 + 缓存"的形态已经接近未来 API client 的调用约定,**迁移成本最低**

#### API client / 真实 B 站 API / fetch

**结论:完全不存在。**

证据(在 `src/` 下 grep 搜索以下模式均无匹配):
- `fetch` / `axios` / `XMLHttpRequest`
- `import.meta.env.VITE`
- `http://` / `https://`

`package.json` 也未引入 axios / ofetch / TanStack Query / SWR 类库(项目仅 `vue` + `vue-router` + `pinia` + `@vueuse/core` + `@iconify/vue` + `vue3-lottie` + `@fontsource/*`)。

`PlaylistView.vue` 第 59-74 行的 `handleSync` / `handleAddTrack` / `handleMore` / `handleTrackMore` 全是 `console.log('[xxx] placeholder', ...)` 占位,进一步印证"B 站同步/增删"业务尚未接通。

#### 数据流向:组件 → store → data

组件**不直接** `import` `data/`。grep `from.*data` 的结果只有两处,且都在 `stores/` 下:

```
src/stores/lyric.ts:4:    import { getLyricByTrackId } from '../data/lyrics'
src/stores/playlist.ts:5: import { fakePlaylists } from '../data/playlists'
```

即:
- `data/playlists.ts` 仅被 `stores/playlist.ts` 引用
- `data/lyrics.ts` 仅被 `stores/lyric.ts` 引用
- 组件全部经 store 中转

数据流符合 AGENTS.md 约定的"单向依赖":`data → store → component`。

### 6.4 状态管理层

#### stores/ 文件清单

6 个 store,每个均使用 `<script setup>` 风格的 setup store(`defineStore('xxx', () => {...})`):

| 文件 | 行数 | 真源 | 职责 |
|---|---|---|---|
| `stores/player.ts` | 23 | 镜像(由 playback 写入) | 仅 `currentTrack` / `queueIndex` 两个 ref + 派生 `currentTrackId`,无 action |
| `stores/queue.ts` | 83 | store 本身 | 队列数组 + `setQueue/append/findIndex/removeAt/clear`,**`removeAt` 返回信号对象而非直接改 player** |
| `stores/playback.ts` | 164 | store 本身 | 播放控制 + 编排 player + queue |
| `stores/playlist.ts` | 42 | `data/playlists.ts` | 歌单查询入口,3 个 getter + 工具函数 `totalDuration` 独立 export |
| `stores/lyric.ts` | 53 | `data/lyrics.ts` | 歌词查询 + `currentLyricIndex` 二分查找 |
| `stores/theme.ts` | 26 | `useStorage` 持久化 | 主题三态 + `watchEffect` 写 `data-theme` 属性 |

#### store 间依赖关系

```
        player (无依赖)
          ↑
          │
        playback ←── queue (无依赖)
          ↑
          │
         lyric
          │
          └──→ player (二次依赖,订阅 currentTrack)

playlist (无依赖,仅依赖 data)
theme    (无依赖)
```

- `player`、`queue`、`playlist`、`theme` 是叶子 store,无内部依赖
- `playback` 编排 `player` + `queue`(AGENTS.md 明确的"跨 store 编排集中在 playback")
- `lyric` 同时订阅 `player.currentTrack`(切歌换词)+ `playback.currentTime`(更新当前行索引)

无循环依赖,方向清晰。

#### store 是否承载业务数据 / 数据获取逻辑

| store | 是否含业务数据 | 是否含数据获取逻辑 |
|---|---|---|
| `player` | 仅镜像(playback 写入) | 无 |
| `queue` | 是(队列数组) | 无 |
| `playback` | 是(isPlaying/currentTime/volume/playMode) | 无(纯内存控制) |
| `playlist` | 引用 `fakePlaylists` 常量 | **有查询入口**,但无异步 |
| `lyric` | 否(computed 派生) | **有查询逻辑**:调 `getLyricByTrackId` + 缓存由 data 层处理 |
| `theme` | 是(mode 持久化) | 无 |

关键点:
- `playlist` 把 `fakePlaylists` 直接包成 `ref`(`stores/playlist.ts` 第 13 行),数据真源仍是 `data/`。注释明确写道:"未来换成 reactive DB 缓存"
- `lyric` 不缓存数据本身,每次 `computed` 重新调用 `getLyricByTrackId`,但 `data/lyrics.ts` 内部有 `Map` 缓存,所以解析只发生一次
- AGENTS.md 中的 `playlist` store 注释提到"未来增删改走 mutation 钩子 + queryClient.invalidateQueries"—— 这是为 TanStack Query 预留的接入点,**当前尚未实现**

#### 跨 store 编排集中度

`playback` store 是唯一显著编排者,编排逻辑集中在:

- `syncMirror(index)`:把 queueIndex 写回 player 镜像
- `play(track)`:先查 queue 再决定 append 还是 jump
- `playAll(tracks, startIndex)`:替换队列 + 同步镜像
- `removeFromQueue(index)`:解释 queue.removeAt 返回的 `affectedIndex/shouldSwitchTrack/isEmpty` 三种信号

`removeFromQueue` 的设计严格遵守了 AGENTS.md 中"`queue.removeAt` 不依赖 player store,只返回信号由 playback 解释"的约定。

`lyric` store 也做了次级编排:订阅 `player.currentTrack?.id` 触发歌词重查 + 订阅 `playback.currentTime` 触发二分查找。

### 6.5 类型层

#### types/ 文件清单

| 文件 | 行数 | 导出 |
|---|---|---|
| `types/track.ts` | 9 | `interface Track { id, title, artist, coverUrl, duration }` |
| `types/playlist.ts` | 22 | `type PlaylistType = 'local' \| 'synced' \| 'favorite' \| 'toview'` + `interface Playlist` |
| `types/lyric.ts` | 15 | `interface LyricLine { time, text, translation? }` + `interface LyricFile { lines, hasTranslation }` |

#### store 是否从 types/ 导入类型

grep 验证 `from.*types`:

- **6 个 store 中有 5 个从 types/ 导入类型**:`player` / `queue` / `playback` / `playlist` / `lyric`(仅 `theme` 不需要)
- `data/` 两个文件也从 types/ 导入
- `utils/lrcParser.ts` 导入 `LyricLine, LyricFile`
- 4 个组件从 types/ 导入:`TrackList` / `TrackListItem` / `PlaylistHeader` / `LyricLineItem`
- 2 个 view 从 types/ 导入:`LibraryView` / `PlaylistView`

完全符合 AGENTS.md "类型从 `types/` 导入,不从 `stores/`" 的约定。

### 6.6 组件 / hooks 层

#### composables/ 现状

仅 1 个文件:`src/composables/usePlaybackProgress.ts`(31 行)

职责:
- 用 `useIntervalFn` 启动每秒 +1s 定时器
- 监听 `playback.isPlaying` 自动启停
- 播到末尾自动调 `playback.next()`

在 `App.vue` 第 10 行全局调用一次:`usePlaybackProgress()`。

**与 BBPlayer 对比的差距**:BBPlayer 的 `apps/mobile/src/features/player/hooks/useLyricSync.ts`(歌词同步、用户拖动 2 秒防抖)这类 hook 在本项目尚未独立成 composable —— `lyric` store 把这部分逻辑吃进了 `computed`(`currentLyricIndex` 二分查找),因此本项目目前没有"歌词同步 hook"。考虑到未来需要"用户手动滚动后 2 秒内不自动跟随"的逻辑,这部分迟早要拆出 composable。

#### 组件如何获取数据

| 组件 | 数据来源 | 是否经 store |
|---|---|---|
| `LibraryView.vue` | `playlistStore.playlists` / `getPlaylistsByType` | 是 |
| `PlaylistView.vue` | `playlistStore.getPlaylistById` / `getToViewPlaylist` | 是 |
| `LyricView.vue` | `lyricStore.lines` / `hasTranslation` / `currentLyricIndex` | 是 |
| `QueueDrawer.vue` | `queueStore.queue` + `player.queueIndex` + `playback.isPlaying` | 是 |
| `NowPlayingBar.vue` | `playback.currentTrack` / `isPlaying` / `currentTime` / `playMode` | 是 |
| `PlayerView.vue` | `playback.*` + `theme.*` | 是 |
| `SettingsView.vue` | `theme.*` + `playback.volume` | 是 |
| `HomeView.vue` | **无 store**,纯静态 `recentPlaylists` 假数组写死在 SFC 内 | 无 |
| `PlaylistHeader.vue` | 接收 `playlist` prop + 直接 import `totalDuration` 工具函数 | 是(部分) |

`HomeView.vue` 第 32-39 行的 `recentPlaylists` 是写死在组件里的假数据,未来需要接入"近期歌单"接口时,这部分需要迁出到 `data/` + `store`。

### 6.7 路由层

#### 路由组织

`src/router/index.ts`(52 行)共 8 条路由,全部用 `name` + 懒加载 `() => import(...)`:

| name | path | view |
|---|---|---|
| `home` | `/` | `HomeView` |
| `library` | `/library` | `LibraryView` |
| `settings` | `/settings` | `SettingsView` |
| `player` | `/player` | `PlayerView` |
| `icons` | `/icons` | `IconsView` |
| `playlist-local` | `/playlist/local/:id` | `PlaylistView` |
| `playlist-favorite` | `/playlist/favorite/:id` | `PlaylistView` |
| `playlist-toview` | `/playlist/toview` | `PlaylistView`(无 `:id`) |

#### 与 AGENTS.md 约定的对比

- 全部用 `name` 不用 `path`:符合约定
- 全部用 `() => import(...)` 懒加载:符合约定
- 歌单详情页按类型分 3 个路由(local/favorite/toview),其中 `playlist-local` 同时承载 `local` 和 `synced` 两种类型:符合约定
- **未配置 404 兜底路由** `/:pathMatch(.*)*`:AGENTS.md 明确要求"预留 `/:pathMatch(.*)*` 404",但 `router/index.ts` 中没有。这是一个**已知的约定违反**(或缺漏)
- `Sidebar.vue` 只列了 `home/library/settings` 三个导航项,未列 `player/icons`,符合"player/icons 不在主导航"的隐含设计

### 6.8 依赖关系图

```
                       types/
                  (track/playlist/lyric)
                    ▲   ▲   ▲   ▲
                    │   │   │   │
        ┌───────────┘   │   │   └────────────┐
        │               │   │                │
       data/            │   │              utils/
   (playlists/lyrics)   │   │           (lrcParser)
        ▲               │   │                ▲
        │               │   │                │
        └────┐          │   │                │
             │          │   │                │
          stores/ ──────┘   │                │
   ┌─────────────────────┐ │                │
   │ player queue theme  │ │                │
   │   ▲     ▲           │ │                │
   │   │     │           │ │                │
   │ playback ──→ queue  │ │                │
   │   ▲                 │ │                │
   │   │                 │ │                │
   │  lyric ─→ player    │ │                │
   │       ─→ playback   │ │                │
   │                     │ │                │
   │ playlist            │ │                │
   │  └→ data/playlists  │ │                │
   └─────────────────────┘ │                │
        ▲                  │                │
        │                  │                │
   ┌────┴──────────────────┴────────────────┴──┐
   │       composables/                         │
   │   usePlaybackProgress ─→ playback store    │
   └────────────────────────────────────────────┘
        ▲
        │
   ┌────┴──────────────────────────────────────────┐
   │ views/ (6 个) + App.vue                       │
   │   App.vue → useThemeStore + usePlaybackProgress│
   │   HomeView: 无依赖                            │
   │   LibraryView → playlistStore + types         │
   │   PlaylistView → playlistStore + playback     │
   │   PlayerView → playback + theme + utils       │
   │   SettingsView → theme + playback             │
   └───────────────────────────────────────────────┘
        ▲
        │
   ┌────┴──────────────────────────────────────────┐
   │ components/                                   │
   │ layout/  NowPlayingBar → playback             │
   │          Sidebar → (无 store)                 │
   │ player/  QueueDrawer → queue + player + playback│
   │          PlayerProgressBar → (无 store,纯 props)│
   │ playlist/ PlaylistHeader → stores/playlist 模块│ ← 问题点
   │            TrackList → (无 store,纯 props)    │
   │            TrackListItem → (无 store,纯 props) │
   │ lyric/   LyricView → lyric + playback         │
   │          LyricLineItem → (无 store,纯 props)  │
   │ common/  CoverPlaceholder → theme             │
   │          IconButton/MD3Slider/MD3Switch → (无) │
   └───────────────────────────────────────────────┘
```

#### 依赖方向不清晰 / 违反单向依赖的点

1. **`PlaylistHeader.vue` 直接 import `stores/playlist` 模块的工具函数 `totalDuration`**(`components/playlist/PlaylistHeader.vue:8`)
   - 不算硬性违反(未访问 store 实例),但工具函数混在 store 文件里、组件直接依赖 store 模块,建议把 `totalDuration` 迁到 `utils/format.ts`
2. **`App.vue` 在根布局里调用 `usePlaybackProgress()`**(`App.vue:10`)
   - 全局副作用(每秒定时器)挂在根组件上,未来如果要 SSR 或测试隔离会不方便。可考虑改为 router 守卫或专门的 `AppInitializer`
3. **`lyric` store 双重依赖 `player` + `playback`**(`stores/lyric.ts:5-6`)
   - 这是合理的(歌词同时需要"当前曲目"和"当前播放进度"),但 `lyric` 已经在做事级编排(订阅 + 派生),未来若再加"用户拖动防抖""手动/自动跟随切换",建议把这部分抽到 `composables/useLyricSync.ts`(与 BBPlayer 对齐)
4. **`HomeView.vue` 内置假数据 `recentPlaylists`**(`HomeView.vue:32-39`)
   - 没有走 `data/` 层,未来接入"最近播放"接口时需要迁出
5. **缺 404 路由**(`router/index.ts` 未配置 `/:pathMatch(.*)*`)
   - 违反 AGENTS.md "预留 `/:pathMatch(.*)*` 404" 约定

### 6.9 与 BBPlayer 5 层架构对比的差距

#### 各层覆盖情况

| BBPlayer 5 层 | 本项目对应 | 状态 |
|---|---|---|
| 1. 类型层 | `types/` (3 文件) | 完整 |
| 2. 数据/API 层 | `data/` (2 文件,全是假数据) | 雏形具备,缺真实 API client |
| 3. 状态/业务编排层 | `stores/` (6 个 Pinia store) | 完整,切片合理 |
| 4. Hooks 层 | `composables/` (仅 1 个) | 严重不足 |
| 5. UI 层 | `views/` + `components/` | 完整 |

#### 缺失的层 / 能力

1. **API/Service 层完全缺失**
   - 无 `services/` 或 `api/` 目录
   - 无 `fetch` / `axios` / `ofetch` 调用
   - 无 B 站 API client(无 `biliApi.ts` 之类)
   - 无请求/响应拦截器、无错误处理
   - 无 TanStack Query / SWR 类的异步缓存层(AGENTS.md 第 3.3 节注释提到"未来增删改走 mutation 钩子 + queryClient.invalidateQueries",是预留点)

2. **Hooks 层(composables/)严重不足**
   - 仅 1 个 `usePlaybackProgress`,承担的是"定时器"职责而非"业务封装"
   - BBPlayer 中 `useLyricSync`(歌词同步 + 用户拖动 2 秒防抖)在本项目未独立成 hook,被吃进 `lyric` store 的 `computed`
   - 缺少 `usePlayer` / `useQueue` / `usePlaylist` 之类的门面 hook(组件目前直接 `useXxxStore()` + `storeToRefs`,跳过了 hook 封装层)

3. **数据缓存层缺失**
   - `data/lyrics.ts` 用 `Map` 做了简单缓存,但无 TTL、无失效、无并发去重
   - `data/playlists.ts` 是常量,无缓存概念
   - 未来接入 API 后,缺 TanStack Query 之类的"请求状态 + 缓存 + 重试"基础设施

4. **IndexedDB / 本地持久化层缺失**
   - 仅 `theme` 用 `useStorage` 持久化到 localStorage
   - 队列、最近播放、播放进度等均未持久化(刷新即丢)

5. **错误边界 / 加载态层缺失**
   - 无 `ErrorBoundary` 组件
   - 无 `Suspense` 异步组件
   - 无统一的 `isLoading` / `error` UI 状态(因为还没异步数据)

#### 已具备雏形的层

1. **类型层**:3 个类型文件覆盖核心域,与 store 完全解耦,方向正确
2. **假数据层**:`data/` 两个文件的注释明确标注"未来接 API 只改这里",迁移路径清晰:
   - `data/playlists.ts` 把 `fakePlaylists` 常量换成 `async function fetchPlaylists()` 即可
   - `data/lyrics.ts` 已经是函数式查询入口 `getLyricByTrackId(trackId)`,把内部字典查询换成 `fetch('/api/lyrics/' + trackId)` 即可,**对外签名不变**,store 层零改动
3. **状态切片**:6 个 store 的职责边界清晰,符合 AGENTS.md 表格约定,`queue.removeAt` 返回信号对象的设计尤为优秀(保证 queue 可独立测试)
4. **跨 store 编排集中**:`playback` 是唯一编排者,方向单向,无循环依赖

#### playback store 是否承担了过多编排职责?

当前 `playback.ts` 164 行,包含:

- 播放控制状态(`isPlaying` / `currentTime` / `volume` / `playMode`)
- 派生(`currentTrack` / `hasPrev` / `hasNext`)
- 内部工具 `syncMirror`
- 12 个 action:`play` / `playAll` / `playQueueIndex` / `pause` / `resume` / `togglePlay` / `next` / `prev` / `seek` / `setVolume` / `removeFromQueue` / `cyclePlayMode`

**结论:目前规模可控,但已经接近"上帝 store"边界。**

具体的"过多"信号:

1. **`removeFromQueue` 承担了过多解释责任**:需要解释 queue 返回的 3 种信号(`isEmpty` / `shouldSwitchTrack` / `affectedIndex !== 0`),并分别处理 player 镜像、`isPlaying`、`currentTime` 三类状态。这段逻辑测试用例多,未来如果再加"删除后是否记录到历史"之类副作用,会更胖
2. **`play(track)` 同时做"查找 + 追加 + 跳转 + 重置进度 + 设 isPlaying"5 件事**,未来若要加"播放前检查版权/缓存"会进一步膨胀
3. **`next()` 内嵌了 playMode 分支**:`one` 重置进度 / `all` 循环回 0 / 其他停止。如果未来加 `shuffle` 真随机算法(当前 `shuffle` 模式实际未实现随机跳转,只是不循环),shuffle 逻辑也会塞进 `next()`

**建议**(未来重构方向,当前不必动):
- 把 `playMode` 相关逻辑抽到 `composables/usePlayMode.ts`,`next()` 只负责"切到下一首",由 composable 决定下一首是谁
- 把 `removeFromQueue` 的"信号解释"抽到 `composables/useQueueOps.ts`,让 `playback` 只调一个 `applyRemoveSignal(signal)` 接口
- 当接入真实音频播放(HTMLAudioElement / Howler.js)后,把"currentTime 实时更新"从 `usePlaybackProgress` 升级为 `useAudioEngine`,让 `playback` store 只存"意图状态",不存"音频引擎状态"

---

## 7. 推荐的前端分离层次划分

### 7.1 推荐的 6 层架构

把"前端 UI"和"三方数据获取"分离开,推荐按下面 6 层划分(**依赖严格单向,从下到上**):

```
┌─────────────────────────────────────────────┐
│  6. UI 层        components/ views/         │  只渲染+派发事件
├─────────────────────────────────────────────┤
│  5. UI 状态层    stores/                    │  播放器/抽屉/主题(不放业务数据)
├─────────────────────────────────────────────┤
│  4. 数据 hooks   hooks/queries mutations/   │  TanStack Query 缓存+重试
├─────────────────────────────────────────────┤
│  3. 编排层       facades/ (domain/)         │  协调多 service/api,可独立测试
├─────────────────────────────────────────────┤
│  2. 数据服务层   services/                  │  屏蔽数据来源(B站API/本地/假数据)
├─────────────────────────────────────────────┤
│  1. API client   api/clients/               │  纯 HTTP+签名,无业务
├─────────────────────────────────────────────┤
│  0. 类型层       types/                     │  与实现解耦的契约
└─────────────────────────────────────────────┘
```

### 7.2 各层职责边界

**0. 类型层** —— 第三方 API 的请求/响应类型、业务实体类型。BBPlayer 放在 `types/apis/` + `types/core/`。

**1. API client** —— 一个第三方一个 client 类,只管 URL/header/签名/序列化,**不依赖任何 store,不写业务**。BBPlayer 的 `client.ts` + `wbi.ts` 就是这一层的好范例。返回值用 `ResultAsync` 而不是 throw,让上层决定怎么处理错误。

**2. 数据服务层** —— 这是 BBPlayer 没有显式命名但实际存在的层。它的价值在于**用接口屏蔽"数据从哪来"**:同一个 `playlistService.getTracks()` 可以切到 B 站 API、IndexedDB、或假数据。web_app 当前的 `data/playlists.ts` 正好是这层的占位形态。

**3. 编排层(facade)** —— 跨资源业务流程落这里。BBPlayer 的 `syncBilibiliPlaylist.ts` 就是典型:协调"B 站 API 拉收藏夹 → 写本地 DB",组件不该知道这些细节。**这层应该可以脱离框架独立测试**。

**4. 数据 hooks** —— 用 TanStack Query / Vue Query 把 facade 包装成响应式,负责缓存 key、staleTime、retry、infinite。BBPlayer 的 `hooks/queries/bilibili/favorite.ts` 就是模板。**组件只消费这一层,不直接调 facade/api**。

**5. UI 状态层** —— 只存"和数据获取无关"的状态(播放器播放/暂停、抽屉开关、主题)。BBPlayer 的 `usePlayerStore` 严格守住了这条边界 —— store 里不存"歌单列表",列表数据走 React Query。

**6. UI 层** —— 只渲染 + 派发事件,不直接调 API。

### 7.3 落地粒度:两种方案

#### 方案 A:Package 级别分离(多端时才值得)

```
packages/
  types/            # 共享类型
  api-bilibili/     # B 站 client(纯 TS,可被 web/desktop/原生共用)
  api-netease/
  services/         # 数据服务(注入不同存储后端)
  domain/           # facade 编排
  shared/           # 纯函数(bv2av、wbi 等可独立测试)
apps/
  web/              # UI,只依赖 packages/*
  desktop/
```

BBPlayer 的 `packages/splash` 就是这种思路的歌词解析库,可惜 B 站 API 没抽出来,导致 `packages/orpheus` 里的 Kotlin/Swift 又重写了一遍 `BilibiliApi.kt` —— 这是没分离的代价。

#### 方案 B:目录级别分离(单端首选,web_app 当前适用)

保持单 app,目录严格分层,依赖单向:

```
src/
  types/             ← 不依赖任何东西
  api/clients/       ← 依赖 types
  services/          ← 依赖 api/clients + types
  facades/           ← 依赖 services + api/clients
  hooks/queries/     ← 依赖 facades
  stores/            ← UI 状态,不依赖 hooks
  components/        ← 依赖 hooks + stores
  views/
```

可以用 ESLint 的 `no-restricted-imports` 规则强制依赖方向(例如禁止 `components/` 里 import `api/clients/`)。

### 7.4 对 web_app 当前的具体建议

web_app 现在已经有:
- `types/` 独立
- `stores/` 切分清晰(player/queue/playback/playlist/lyric/theme)
- `data/` 假数据层 —— 这正是 service 的雏形

缺的是:
- `api/clients/` —— 第三方 API client
- `services/` —— 把 `data/` 升级成"可切换数据源"的接口
- `facades/` —— 跨 store 编排(playback store 现在既管播放又管编排,边界有点糊)
- `hooks/queries/` —— 用 `@tanstack/vue-query` 替代手写缓存

#### 最小成本演进路径

1. **把 `data/playlists.ts` 重构成 `services/playlistService.ts`**,保持调用方接口不变,内部从假数据切到真 API 时只改这一处
2. **新建 `api/clients/bilibili.ts`**,把所有 B 站调用收敛到一个类,WBI 签名抽到 `api/clients/bilibili/wbi.ts`
3. **抽 `facades/playback.ts`** —— "播放 B 站视频"这种跨 store 流程(拉音频流 URL → 写 player store → 加入 queue → 通知原生播放器)挪到这里,playback store 只保留状态镜像
4. **引入 `@tanstack/vue-query`**,用 `useQuery` 包装 facade 调用,组件里不再手写 loading/error
5. **store 严守"只放 UI 状态"** —— AGENTS.md 里已经写了"派生态用 computed",再加一条"业务数据不进 store"

---

## 8. 总结

### 8.1 BBPlayer 的实际架构

BBPlayer 没有在 package 级别做前后端分离,但 app 内部其实已经分了 5 层(api / service / facade / hooks / ui)。B 站 API 直连无代理,cookie 在前端管理。

关键设计要点:
- **B 站 API 直连**:无 server-side 代理,cookie 在前端管理
- **数据获取三层架构**:组件 → hooks(queries/mutations) → facades → {services, api clients}
- **类型边界划在 API 契约**:业务实体类型独立,由 facade 层消化字段差异

### 8.2 对 web_app 的启示

对 web_app 来说,**不必非要拆 package,但要把 5 层的目录边界立清楚,并用 ESLint 强制依赖方向** —— 这样未来无论是切数据源、加云后端、还是换 UI 框架,改动都能收敛在某一层。

具体演进路径:

1. **短期**(假数据阶段):补 404 路由、把 `totalDuration` 迁到 `utils/format.ts`、把 `HomeView` 的假数据迁到 `data/`
2. **中期**(接 B 站 API):新建 `api/clients/bilibili.ts` + `wbi.ts`,把 `data/` 升级为 `services/`,引入 TanStack Query
3. **长期**(Electron 架构):主进程承载所有"后端"逻辑(API client / SQLite / facade),渲染进程专注 UI。架构方案见 [后端计划.md](./后端计划.md)

### 8.3 关键文件索引

**BBPlayer 关键文件**(仅前端 + 三方数据获取)

| 文件 | 作用 |
|---|---|
| `apps/mobile/src/lib/api/bilibili/client.ts` | B 站 API client(fetch + cookie 注入) |
| `apps/mobile/src/lib/api/bilibili/api.ts` | 30+ B 站接口封装 |
| `apps/mobile/src/lib/api/bilibili/wbi.ts` | WBI 签名算法 |
| `apps/mobile/src/hooks/stores/useAppStore.ts` | bilibili cookie 状态机 |
| `apps/mobile/src/lib/config/queryClient.ts` | TanStack Query 配置 |
| `apps/mobile/src/lib/facades/syncBilibiliPlaylist.ts` | B 站 API 同步到本地 DB |
| `apps/mobile/src/lib/services/{playlistService,trackService,artistService}.ts` | 单表 CRUD |
| `apps/mobile/src/hooks/queries/bilibili/*.ts` | B 站查询 hook 模板 |
| `packages/splash/src/` | 歌词解析库(纯 TS,可独立测试) |
| `packages/orpheus/android/.../bilibili/` | 原生侧 B 站 API(Kotlin,重写了一份) |

**web_app 关键文件**

| 文件 | 作用 |
|---|---|
| `src/types/track.ts` | Track 类型 |
| `src/types/playlist.ts` | Playlist 类型 + PlaylistType 枚举 |
| `src/types/lyric.ts` | LyricLine / LyricFile 类型 |
| `src/data/playlists.ts` | 假歌单数据(7 个) |
| `src/data/lyrics.ts` | 假歌词数据 + `getLyricByTrackId` 查询入口 |
| `src/stores/player.ts` | 当前播放镜像(无 action) |
| `src/stores/queue.ts` | 队列数据 + `removeAt` 返回信号 |
| `src/stores/playback.ts` | 播放控制 + 跨 store 编排(164 行) |
| `src/stores/playlist.ts` | 歌单查询入口 |
| `src/stores/lyric.ts` | 歌词查询 + 二分查找 |
| `src/stores/theme.ts` | 主题三态 + 持久化 |
| `src/composables/usePlaybackProgress.ts` | 每秒 +1s 定时器 |
| `src/router/index.ts` | 8 条路由配置 |
| `src/views/*.vue` | 6 个路由页面 |
| `src/components/**/*.vue` | 12 个组件,按 5 子域切分 |

**已识别的小问题**

| 文件 | 问题 |
|---|---|
| `src/components/playlist/PlaylistHeader.vue:8` | 工具函数 `totalDuration` 应迁出到 `utils/format.ts` |
| `src/views/HomeView.vue:32-39` | 内置假数据 `recentPlaylists` 应迁出到 `data/` |
| `src/router/index.ts` | 缺 `/:pathMatch(.*)*` 404 路由(违反 AGENTS.md 约定) |
