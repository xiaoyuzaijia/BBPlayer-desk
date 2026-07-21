# AGENTS.md — bbplayer-web

## 项目说明

学习项目：Vue 3 + TypeScript 桌面 Web 应用，参考 BBPlayer（B站音乐播放器），通过 CSS 自定义属性使用 MD3（Material Design 3）设计语言。

## 命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 先类型检查（`vue-tsc -b`），再构建（`vite build`） |
| `pnpm preview` | 预览构建产物 |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 自动修复 |

务必使用 `pnpm`，不要用 npm 或 yarn。

## 技术栈

Vue 3 `<script setup>` + TypeScript + Vite 8 + Tailwind CSS v4（`@import "tailwindcss"`）+ Vue Router 5 + Pinia 3 + @vueuse/core + @iconify/vue + vue3-lottie + @fontsource 字体 + ESLint 10 flat config（typescript-eslint strict + eslint-plugin-vue vue3-recommended）。

## 项目结构

```
src/
├── types/         # 类型定义（与 store 解耦）：track / playlist / lyric
├── data/          # 假数据层（未来接 API 只改这里）：playlists / lyrics
├── stores/        # Pinia store 按职责切分：player / queue / playback / playlist / lyric / theme
├── router/        # 8 个路由
├── views/         # 路由页面：Home / Library / Settings / Player / Playlist / Icons
├── components/    # layout / common / player / playlist / lyric
├── composables/   # usePlaybackProgress（每秒 +1s 定时器）
├── utils/         # icons / format / lottie / lrcParser
├── App.vue        # 根布局
├── main.ts        # 入口
├── style.css      # Tailwind + @theme + MD3 CSS 变量
└── eslint.config.js
```

`docs/plan/` 包含分阶段计划与调研报告。

## 状态管理（核心规范）

参考 BBPlayer 的 Zustand 架构，Pinia store 按"职责边界 + 数据真源位置"切分，**不写大而全的 store**。业务数据放 `data/`，store 只做查询入口；类型放 `types/`；跨 store 编排集中在 `playback`；派生态用 `computed`；组件中用 `storeToRefs` 解构状态。

| Store | 职责 | 真源 |
|---|---|---|
| `player` | 当前播放镜像（`currentTrack` / `queueIndex`） | 镜像，由 playback 写入 |
| `queue` | 队列数据 + 增删改 | store 本身 |
| `playback` | 播放控制 + 编排（`isPlaying` / `currentTime` / `volume` / `playMode` + actions） | store 本身 |
| `playlist` | 歌单查询入口 | `data/playlists.ts` |
| `lyric` | 歌词查询 + `currentLyricIndex`（二分查找） | `data/lyrics.ts` |
| `theme` | 主题三态（light/dark/system） | useStorage 持久化 |

`queue.removeAt` 不依赖 player store，只返回信号（`affectedIndex` / `shouldSwitchTrack` / `isEmpty`）由 playback 解释，保证 queue 可独立测试。

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
- **lyric/** —— `LyricView`（滚动容器，活动行对齐视口顶部 35%，顶/底 60px `mask-image` 淡出）、`LyricLineItem`（主歌词 + 翻译默认显示，点击 seek，空行不显示音符）

## 已知陷阱

- ESLint 配置在 `eslint.config.js`（flat config），未引入 Prettier —— 格式类规则由 `pnpm lint:fix` 自动修复
- NPB 外层 `.npb-wrap` 用了 `transform: translateX(-50%)` —— fixed 后代以此为 containing block，floating 队列抽屉必须 `<Teleport to="body">` 跳出
- VueUse `onClickOutside` 的 `ignore` 类型是 `MaybeRefOrGetter<(MaybeElementRef | string)[]>`（整个数组的 getter，不是元素级 getter）
- `useResizeObserver` 首次读取宽度可能为 0，需 `watch(open)` 兜底读 `offsetWidth`
- Vue 3 函数式 `:ref` 对**子组件**用时收到的是组件实例不是 DOM —— 从 `$el` 取根 DOM
- `mask-image` 需同时写 `-webkit-mask-image` 兼容 WebKit

## 参考项目

BBPlayer 位于 `E:\xiao_yu\Program\BBPlayer`，是设计参考：

- `apps/mobile/src/lib/theme/material3Colors.ts` —— MD3 颜色映射
- `apps/mobile/src/hooks/stores/` —— 状态管理架构
- `apps/mobile/src/features/library/` —— 音乐库列表模式
- `apps/mobile/src/features/playlist/` —— 歌单详情页
- `apps/mobile/src/features/player/components/PlayerLyrics.tsx` —— 歌词滚动容器（活动行偏上、`MaskedView` 淡出、手动/自动跟随区分）
- `apps/mobile/src/features/player/hooks/useLyricSync.ts` —— 歌词同步（用户拖动 2 秒防抖）
- `apps/docs/docs/guides/playlist.md` —— 歌单需求文档

所有 UI 模式（侧边栏、NPB、播放器、队列抽屉、歌词滚动）遵循 BBPlayer 的 MD3 样式约定。
