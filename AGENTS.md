# AGENTS.md — bbplayer-web

## 项目说明

学习项目：Vue 3 + TypeScript 桌面 Web 应用，参考 BBPlayer（B站音乐播放器），通过 CSS 自定义属性使用 MD3（Material Design 3）设计语言。

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 先类型检查（`vue-tsc -b`），再构建（`vite build`） |
| `pnpm preview` | 预览构建产物 |

务必使用 `pnpm`，不要用 npm 或 yarn。

## 技术栈

- Vue 3 `<script setup>` SFC + TypeScript
- Vite 8
- Tailwind CSS v4（使用 `@import "tailwindcss"`，不是旧的 `@tailwind` 指令）
- Vue Router 5（`createWebHistory`）
- Pinia 3（状态管理）
- @vueuse/core（组合式工具：`useResizeObserver` / `useStorage` / `useMediaQuery` / `onClickOutside` / `useIntervalFn`）
- @iconify/vue（图标）
- vue3-lottie（Lottie 动画）
- @fontsource/roboto-flex + @fontsource/noto-sans-sc（字体）
- 尚未安装测试/代码检查工具

## 项目结构

```
src/
├── types/                       # 类型定义（与 store 解耦，避免循环依赖）
│   ├── track.ts                 # Track 接口
│   └── playlist.ts              # Playlist / PlaylistType 接口
├── data/
│   └── playlists.ts             # 假数据（未来接入 API/IndexedDB 时只改这里）
├── stores/                      # Pinia store（按职责切分，参考 BBPlayer）
│   ├── player.ts                # 极简镜像：currentTrack + queueIndex（不放 action）
│   ├── queue.ts                 # 队列数据：queue + setQueue/append/removeAt
│   ├── playback.ts              # 播放控制 + 编排：isPlaying/currentTime/volume/playMode + 12 个 action
│   ├── playlist.ts              # 歌单查询入口（从 data/ 取）+ totalDuration 工具函数
│   └── theme.ts                 # 主题三态：light/dark/system
├── router/index.ts              # 8 个路由：/ /library /settings /player /icons + 3 个歌单详情页
├── views/                       # 路由页面组件
│   ├── HomeView.vue             # 首页：搜索栏 + 快捷卡片
│   ├── LibraryView.vue          # 音乐库：3 个 tab（本地/B站收藏/稍后再看）+ 歌单列表
│   ├── SettingsView.vue         # 设置：外观 / 播放 / 关于
│   ├── PlayerView.vue           # 全屏播放器：封面 + Lottie 控制 + 进度条 + 歌词占位
│   ├── PlaylistView.vue         # 歌单详情页：顶栏 + PlaylistHeader + TrackList
│   └── IconsView.vue            # 图标库预览
├── components/
│   ├── layout/                  # Sidebar、NowPlayingBar
│   ├── common/                  # 通用组件：IconButton、CoverPlaceholder、MD3Slider、MD3Switch
│   ├── player/                  # PlayerProgressBar、QueueDrawer
│   └── playlist/                # PlaylistHeader、TrackList、TrackListItem
├── composables/
│   └── usePlaybackProgress.ts   # 每秒 +1s 定时器，到末尾自动 next()
├── utils/
│   ├── icons.ts                 # ~90 个 material-symbols 图标常量
│   ├── format.ts                # formatTime（秒 → mm:ss）
│   └── lottie.ts                # tintLottieSource（把 Lottie 白色占位符替换成主题色）
├── App.vue                      # 根布局（sidebar + router-view + 顶层 usePlaybackProgress）
├── main.ts                      # 入口：挂载 Vue + Pinia + Router
└── style.css                    # Tailwind 导入 + @theme 映射 + MD3 CSS 变量（亮/暗/[data-theme]）
```

`docs/plan/` 包含分阶段计划文档。

## 状态管理（核心规范）

参考 BBPlayer 的 Zustand 架构，Pinia store 按"职责边界 + 数据真源位置"切分，**不写大而全的 store**：

| Store | 职责 | 关键字段 | 真源位置 |
|---|---|---|---|
| `player` | 当前播放镜像 | `currentTrack` / `queueIndex` / `currentTrackId` | 镜像，由 playback 写入 |
| `queue` | 队列数据 | `queue` + `setQueue` / `append` / `removeAt` / `clear` | store 本身 |
| `playback` | 播放控制 + 编排 | `isPlaying` / `currentTime` / `volume` / `playMode` + 12 个 action | store 本身 |
| `playlist` | 歌单查询入口 | `playlists` + 3 个查询方法 | 从 `data/playlists.ts` 取 |
| `theme` | 主题切换 | `mode` / `isDark` / `setMode` | useStorage 持久化 |

### 设计原则

1. **store 极简化**：每个 store 只做一件事，不放无关字段
2. **业务数据与状态分离**：假数据放 `data/`，store 只做查询入口；未来接 API 时只改 `data/` 一处
3. **类型与 store 解耦**：类型放 `types/`，store / 组件都从 `types/` 导入，避免循环依赖
4. **编排集中**：跨 store 操作（如"移除当前播放曲目需同时改队列 + 镜像 + 播放状态"）集中在 `playback` store
5. **派生用 computed**：`currentTrack` / `hasPrev` / `hasNext` / `playMode` 等派生态用 `computed`，不存原始值
6. **storeToRefs 解构**：在组件中用 `storeToRefs` 拿响应式状态，action 直接调

### queue.removeAt 的返回值设计

queue store 不依赖 player store，只返回"移除后调用方需要做什么"：

```ts
removeAt(index, currentQueueIndex) → {
  affectedIndex: number,      // -1=前移, 0=不变, n=新当前索引
  shouldSwitchTrack: boolean, // 是否需要切歌
  isEmpty?: boolean           // 队列是否清空
}
```

由 playback store 解释这些信号并更新 player 镜像。这样 queue store 可独立测试。

## MD3 设计系统

所有 MD3 令牌都定义在 `src/style.css` 中，使用 CSS 自定义属性（`--md-*`）。共 40+ 个令牌，涵盖颜色（primary/secondary/tertiary/surface/outline/error，各带 `on-*` 和 `-container` 变体）、层级阴影（level0–5）、圆角（sm/md/lg/full）、字阶（headline/title/body/label）和间距（space-1~8）。

**三套主题块**：
- `:root` —— 亮色默认
- `@media (prefers-color-scheme: dark)` —— 系统暗色
- `[data-theme="light"]` / `[data-theme="dark"]` —— 用户显式覆盖（由 `theme` store 写入 `data-theme` 属性）

**重要：** Tailwind v4 不会自动映射这些变量。在 class 中使用时要写成 `bg-[var(--md-surface)]` 或 `text-[var(--md-on-surface)]`。`style.css` 中的 `@theme` 块会把部分令牌映射成 Tailwind 工具类。

新增令牌时，务必**同时在三套主题块中**添加。

## 代码约定

- 代码中要写注释
- 写完代码后，用中文向用户进行简洁的讲解
- 优先使用 Vue 3 `<script setup lang="ts">` SFC 语法
- 使用 `onMounted` / `watch` / `computed` 等组合式 API，不要用选项式 API
- 使用 `storeToRefs` 解构 Pinia 状态以保持响应性
- 类型从 `types/` 导入，不要从 `stores/` 导入类型

## 文件编辑约定

- **优先使用 `Edit` 工具进行局部修改，一般不用 `Write` 工具整体重写**。`Write` 会覆盖整个文件，容易丢失用户手动调整的代码（如像素值、样式微调等）。只有在新建文件或确认需要整体重构时才用 `Write`。
- **每次 `Edit` 前如果不确定当前内容，先用 `Read` 确认，再 `Edit`**。不要凭记忆中的"上次写的内容"直接构造 `old_string`，否则容易覆盖用户手动修改的代码（如手动调整的像素值、样式等级等）。确认流程：先 `Read` 目标行范围 → 根据真实内容构造 `old_string` → `Edit`。

## 路由约定

- 路由链接始终使用 `name`，不要用原始 `path` 字符串
- 路由通过 `() => import(...)` 懒加载
- Sidebar 使用 `<router-link>` 配合 Tailwind 实现激活态样式
- 歌单详情页 3 个路由（按类型分发）：
  - `playlist-local/:id` —— 本地歌单（local + synced）
  - `playlist-favorite/:id` —— B 站收藏夹
  - `playlist-toview` —— 稍后再看（全局唯一，无 id）
- 预留 `/:pathMatch(.*)*` 用于 404 页面

## 组件约定

### 通用组件（components/common/）

- `IconButton.vue` —— MD3 图标按钮，`color-mix` + `currentColor` 做 state-layer，支持 `selected` / `disabled`
- `CoverPlaceholder.vue` —— 标题 hash → HSL 渐变 + 首字母占位符（移植自 BBPlayer）
- `MD3Slider.vue` —— 原生 range + linear-gradient 切 active track
- `MD3Switch.vue` —— 36×16→52×32 三态切换

### 播放器组件（components/player/）

- `PlayerProgressBar.vue` —— 自绘 slider，pointer 拖动 + mask 挖空 track + 键盘 ±5s
- `QueueDrawer.vue` —— 播放队列抽屉，两种 variant：
  - `floating` —— NPB 列表按钮触发，teleport 到 body，宽度对齐 NPB 整体
  - `inline` —— PlayerView 列表按钮触发，作为 `.sub-controls` 子元素绝对定位，宽度对齐控制台

### 歌单组件（components/playlist/）

- `PlaylistHeader.vue` —— 120 封面 + 标题 + 类型徽章 + 操作按钮（按 type 显隐：local 显示"添加歌曲"，其他显示"同步"）
- `TrackList.vue` —— 表头行 + v-for TrackListItem + 空态
- `TrackListItem.vue` —— 序号/均衡器 + 48 封面 + 标题/作者 + 时长 + 更多按钮

## 已知陷阱

- `tsconfig.app.json` 设置了 `noUnusedLocals: true` 和 `noUnusedParameters: true` —— 未使用的导入/变量会导致构建错误
- `index.html` 中的 `html lang="en"` 后续应改为 `"zh-CN"`
- 没有 ESLint 或 Prettier —— `vue-tsc` 类型检查是唯一的静态验证手段
- NPB 外层 `.npb-wrap` 用了 `transform: translateX(-50%)` —— fixed 后代会以此作为 containing block，floating 队列抽屉必须 `<Teleport to="body">` 跳出
- VueUse `onClickOutside` 的 `ignore` 类型是 `MaybeRefOrGetter<(MaybeElementRef | string)[]>` —— 即"整个数组的 getter"，不是"数组的 getter 元素"
- 组件内测量的元素宽度（如 `useResizeObserver`）首次读取可能为 0，需用 `watch(open)` 兜底读 `offsetWidth`

## 参考项目

BBPlayer 位于 `E:\xiao_yu\Program\BBPlayer`，是设计参考：

- `apps/mobile/src/lib/theme/material3Colors.ts` —— MD3 颜色映射
- `apps/mobile/src/hooks/stores/` —— 状态管理架构（store 极简化、按职责切分、业务数据不入 store）
- `apps/mobile/src/features/library/` —— 音乐库列表与列表项模式
- `apps/mobile/src/features/playlist/` —— 歌单详情页（PlaylistHeader / TrackItem / 选择模式）
- `apps/docs/docs/guides/playlist.md` —— 歌单需求文档（在线/本地/同步型/动态合并 4 类边界规则）

所有 UI 模式（侧边栏选项卡、浮动正在播放栏、播放器封面+控制布局、队列抽屉）都遵循 BBPlayer 的 MD3 样式约定。
