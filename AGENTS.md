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
- 尚未安装测试/代码检查工具

## 项目结构

```
src/
├── router/index.ts          # 4 个路由：/ /library /settings /player
├── views/                   # 路由页面组件
│   ├── HomeView.vue         # 首页：搜索栏 + 2×2 快捷卡片
│   ├── LibraryView.vue      # 音乐库：3 个子 tab + 假歌单
│   ├── SettingsView.vue     # 设置：3 个分组列表
│   └── PlayerView.vue       # 全屏播放器：封面 + 控制 + 进度条
├── components/layout/       # Sidebar、NowPlayingBar
├── stores/
│   └── player.ts            # 播放器状态（currentTrack/isPlaying/queue，computed 驱动）
├── App.vue                  # 根布局（sidebar + router-view）
├── main.ts                  # 入口：挂载 Vue + Pinia + Router
└── style.css                # Tailwind 导入 + MD3 CSS 变量
```

`docs/plan/phase1-frontend.md` 包含第一阶段完整计划和执行步骤。

## MD3 设计系统

所有 MD3 令牌都定义在 `src/style.css` 中，使用 CSS 自定义属性（`--md-*`）。共 40+ 个令牌，涵盖颜色（primary/secondary/tertiary/surface/outline/error，各带 `on-*` 和 `-container` 变体）、层级阴影（level0–5）、圆角（sm/md/lg/full）、字阶（headline/title/body/label）和间距（space-1~8）。暗色模式通过 `@media (prefers-color-scheme: dark)` 实现。

**重要：** Tailwind v4 不会自动映射这些变量。在 class 中使用时要写成 `bg-[var(--md-surface)]` 或 `text-[var(--md-on-surface)]`。如果在 `style.css` 中添加 `@theme` 块，这些令牌就会变成 Tailwind 工具类（如 `bg-md-surface`）。

新增令牌时，务必同时在亮色 `:root` 和暗色 `@media` 块中一起添加。

## 代码约定

- 代码中要写注释
- 写完代码后，用中文向用户进行简洁的讲解
- 优先使用 Vue 3 `<script setup lang="ts">` SFC 语法
- 使用 `onMounted` / `watch` 等组合式 API，不要用选项式 API
- 使用 `storeToRefs` 解构 Pinia 状态以保持响应性

## 文件编辑约定

- **优先使用 `Edit` 工具进行局部修改，一般不用 `Write` 工具整体重写**。`Write` 会覆盖整个文件，容易丢失用户手动调整的代码（如像素值、样式微调等）。只有在新建文件或确认需要整体重构时才用 `Write`。
- **每次 `Edit` 前如果不确定当前内容，先用 `Read` 确认，再 `Edit`**。不要凭记忆中的"上次写的内容"直接构造 `old_string`，否则容易覆盖用户手动修改的代码（如手动调整的像素值、样式等级等）。确认流程：先 `Read` 目标行范围 → 根据真实内容构造 `old_string` → `Edit`。

## 路由约定

- 路由链接始终使用 `name`，不要用原始 `path` 字符串
- 路由通过 `() => import(...)` 懒加载
- Sidebar 使用 `<router-link>` 配合 Tailwind 实现激活态样式
- 预留 `/:pathMatch(.*)*` 用于 404 页面

## 已知陷阱

- `tsconfig.app.json` 设置了 `noUnusedLocals: true` 和 `noUnusedParameters: true` —— 未使用的导入/变量会导致构建错误
- `index.html` 中的 `html lang="en"` 后续应改为 `"zh-CN"`
- 没有 ESLint 或 Prettier —— `vue-tsc` 类型检查是唯一的静态验证手段

## 参考项目

BBPlayer 位于 `E:\xiao_yu\Program\BBPlayer`，是设计参考。其 `apps/mobile/src/lib/theme/material3Colors.ts` 包含了 MD3 颜色映射。所有 UI 模式（侧边栏选项卡、浮动正在播放栏、播放器封面+控制布局）都遵循 BBPlayer 的 MD3 样式约定。
