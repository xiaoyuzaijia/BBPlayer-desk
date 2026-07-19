# BBPlayer 歌词（Lyric）实现调研报告

> 调研对象：`E:\xiao_yu\Program\BBPlayer`
> 调研目的：为我们项目的歌词前端实现提供参考

BBPlayer 的歌词系统是一个工程化非常完整的子系统：从数据获取（多源 API 并发竞速）、解析（自研 SPL 包）、存储（文件系统缓存）、状态管理（React Query + Reanimated SharedValue 跨越 React 与 UI 线程）、UI（两套风格 + 逐字卡拉OK + 浮动遮罩）、到原生桥接（Android 桌面/状态栏/车机三类消费者），每一层都有清晰边界。下面按需求逐项展开。

---

## 1. 需求与产品形态

### 相关文档

- `E:\xiao_yu\Program\BBPlayer\apps\docs\docs\guides\lyrics.md` —— 用户向使用文档
- `E:\xiao_yu\Program\BBPlayer\apps\docs\docs\SPL.md` —— SPL 格式规范（转载自 Salt Player）
- `E:\xiao_yu\Program\BBPlayer\apps\docs\docs\guides\player.md` —— 播放器整体文档（含歌词入口）
- `E:\xiao_yu\Program\BBPlayer\.github\workflows\check-lyricon-updates.yml` —— 词幕（Lyricon）上游同步 CI

### 显示形态

| 形态 | 实现 |
|---|---|
| 纯文本回退 | `PlayerLyrics.tsx` 在 `parseAndMergeLyrics` 返回空或解析失败时降级为 `<Text>` 显示 `lyrics.lrc` 原文 |
| 逐行滚动 | `PlayerLyrics.tsx` 主模式（`Animated.ScrollView` + 当前行高亮） |
| 逐字卡拉OK | `KaraokeWord.tsx`，基于 SPL 逐字 spans（依赖 `enableVerbatimLyrics` 设置） |
| 翻译 | `LyricLineItem.tsx` 渲染 `item.translation` |
| 罗马音 | `LyricLineItem.tsx` 渲染 `item.romaji` |
| 双语切换 | `LyricsControlOverlay.tsx` 右下角菜单提供「翻译 ⇄ 罗马音」切换；`preferredLyricType` 状态决定优先显示哪种 |
| 旧版样式 | `OldSchoolLyricLineItem`（居中小字、无缩放）vs `ModernLyricLineItem`（左对齐大字、当前行 scale 1.05 + translateX 12） |
| 桌面歌词（Android） | `FloatingLyricsManager.kt` + `LyricView.kt`，悬浮窗 + 拖拽 + 设置面板 |
| 状态栏歌词（Android） | 三框架：词幕 Lyricon（推荐，逐字+翻译）、魅族 Flyme、SuperLyric |
| 车机歌词（Android） | `CarLyricsConsumer`，把当前歌词写入 MediaMetadata 标题字段 |
| 歌词分享卡片 | `LyricsShareCard.tsx`，最多选 5 行生成带二维码的 PNG 卡片 |

### 歌词来源

**仅三种外部源 + 手动**，B 站本身**不是**歌词源：

1. **网易云音乐** —— `apps/mobile/src/lib/api/netease/api.ts`（支持 YRC 逐字、翻译、罗马音）
2. **QQ 音乐** —— `apps/mobile/src/lib/api/qqmusic/api.ts`（仅 LRC + 翻译）
3. **酷狗音乐** —— `apps/mobile/src/lib/api/kugou/api.ts`（仅 LRC，Base64 解码）
4. **手动输入** —— `EditLyrics.tsx` 模态，三标签页（主歌词/翻译/罗马音），SPL 格式校验
5. **手动搜索** —— `ManualSearchLyrics.tsx` 模态，三源并行检索，用户挑选

B 站的作用是音源 + 通过 `bgm_info.music_title` 反查真实歌曲名（`getPreciseMusicNameOnBilibiliVideo`，从 `《...》` 或 `「...」` 中提取）。

### 多源切换/合并策略

- **自动模式（`auto`）**：`Promise.any` 三源并发，**最先返回的成功结果胜出**，其余 `AbortController.abort()` 取消。匹配度不参与决策（文档明确警告）。
- **指定源模式**：`lyricSource` 设置项可选 `netease` / `qqmusic` / `kugou` / `auto`。
- **翻译/罗马音合并**：`parseAndMergeLyrics`（在 `@bbplayer/splash` 包内）以主歌词时间戳为基准，按 `startTime` 严格对齐，匹配率 < 20% 则丢弃次要歌词。

---

## 2. 数据结构

### 内部存储类型（`apps/mobile/src/types/player/lyrics.ts`）

```ts
export interface LyricFileData {
    id: string                       // 曲目 uniqueKey
    updateTime: number               // 缓存时间戳
    lrc?: string                     // 主歌词（SPL 格式字符串）
    tlyric?: string                  // 翻译歌词（SPL 格式字符串）
    romalrc?: string                 // 罗马音歌词（SPL 格式字符串）
    errorMessage?: string            // 离线/获取失败的展示文本（不走解析）
    manualSkip?: boolean             // 用户主动跳过 → smartFetch 不再请求网络
    misc?: { userOffset?: number }   // 用户偏移量（秒）
}

export type LyricProviderResponseData = Omit<LyricFileData, 'id' | 'updateTime' | 'misc'>
```

### SPL 解析后的运行时类型（`packages/splash/src/types.ts`）

```ts
export interface LyricSpan {        // 逐字最小单元
    text: string
    startTime: number               // 绝对毫秒
    endTime: number                 // 绝对毫秒
    duration: number                // 预计算毫秒
}

export interface LyricLine {        // 一行歌词
    startTime: number               // 毫秒
    endTime: number                 // 毫秒
    content: string                 // 主歌词文本（拼接 spans 后）
    translation?: string            // 翻译（合并后填充）
    romaji?: string                 // 罗马音（合并后填充）
    translations: string[]          // 旧版兼容：多行翻译数组
    isDynamic: boolean              // 是否含逐字 spans
    spans: LyricSpan[]              // 逐字片段
}

export interface SplLyricData {
    meta: Record<string, string>    // [ar:]/[ti:] 等元数据
    lines: LyricLine[]              // 已扁平化、已排序
}
```

### Orpheus 原生桥接类型（`packages/orpheus/src/ExpoOrpheusModule.ts`）

```ts
export interface LyricSpan {
    text: string
    startTime: number  // ms
    endTime: number    // ms
    duration: number   // ms
}

export interface LyricLine {
    timestamp: number          // 秒（注意：JS→原生时除以 1000）
    endTime?: number           // 秒
    text: string
    translation?: string
    romaji?: string
    spans?: LyricSpan[]
}

export interface LyricsData {
    lyrics: LyricLine[]
    offset: number             // 秒
}

export type LyricConsumer = 'desktop' | 'statusBar' | 'car'
```

### Android 原生镜像（`packages/orpheus/android/.../model/LyricsModels.kt`）

`LyricsLine` / `LyricSpan` / `LyricsData` 用 `@Serializable` + `@SerialName` 与 JS 侧 1:1 对齐，通过 `JSON.stringify` 走 `setLyricsInternal` 桥接。

---

## 3. 服务层（`apps/mobile/src/lib/services/lyricService.ts`）

`LyricService` 是单例（`const lyricService = new LyricService(neteaseApi, qqMusicApi, kugouApi)`），所有方法返回 `ResultAsync<T, CustomError>`（neverthrow）。

### 关键函数签名

```ts
class LyricService {
    // 多源并发竞速，source='auto' 时三源同时跑
    public getBestMatchedLyrics(
        track: Track,
        preciseKeyword?: string,
        source?: 'auto' | 'netease' | 'qqmusic' | 'kugou',
    ): ResultAsync<LyricProviderResponseData, CustomError>

    // 智能获取：本地缓存 → 网络拉取（含 B 站歌名反查）→ 落盘
    public smartFetchLyrics(track: Track): ResultAsync<LyricFileData, CustomError>

    // 指定搜索结果拉取（手动搜索用）
    public fetchLyrics(
        item: LyricSearchResult[0],
        uniqueKey: string,
    ): ResultAsync<LyricFileData, Error>

    // 写入文件系统 + 推送到原生 overlay（300ms debounce）
    public saveLyricsToFile(
        lyrics: LyricFileData,
        uniqueKey: string,
    ): ResultAsync<LyricFileData, FileSystemError>

    // 标记跳过（清除时调用）
    public skipLyric(uniqueKey: string): ResultAsync<LyricFileData, FileSystemError>

    // 推送到桌面/状态栏/车机（按 Orpheus.isXxxEnabled 过滤）
    public pushLyricsToOverlays(trackId: string): void

    // 预加载下一首歌词（当前未启用，被注释）
    public async preloadNextTrackLyrics(): Promise<void>

    // 旧版 ParsedLrc 格式迁移到 LyricFileData
    public async migrateFromOldFormat(): Promise<void>

    // 清空所有缓存
    public clearAllLyrics(): Result<true, unknown>

    // 从 B 站 webplayer 接口提取真实歌曲名
    public async getPreciseMusicNameOnBilibiliVideo(
        metadata: BilibiliTrack['bilibiliMetadata'],
    ): Promise<string | undefined>
}
```

### 获取流程

```
smartFetchLyrics(track)
   ├── 读文件：document/lyrics/{uniqueKey}.json
   │     ├── manualSkip=true → 直接返回（不联网）
   │     └── 无文件/解析失败 → 进入网络分支
   ├── fetchFromNetwork()
   │     ├── B 站源：先调 bilibiliApi.getWebPlayerInfo 拿 bgm_info.music_title
   │     │             → 从《...》或「...」中提取精确歌名
   │     ├── 读 useAppStore.settings.lyricSource（默认 'netease'）
   │     └── getBestMatchedLyrics(track, preciseKeyword, source)
   │           └── Promise.any([netease, qqmusic, kugou])
   │                 └── 任一成功 → abort 其余
   └── processAndSaveLyrics()
         └── saveLyricsToFile() → 写盘 + pushLyricsToOverlays()
```

### SPL 解析器（`packages/splash/src/parser/`）

- **`parseSpl(lrcContent: string): SplLyricData`** —— 主解析器
  - 识别 `[mm:ss.SSS]` / `<mm:ss.SSS>` 时间标签
  - 支持多时间戳同行（重复行展开）
  - 翻译识别：同时间戳的后续行视为翻译
  - 元数据行 `[ar:xxx]` / `[ti:xxx]` 入 `meta`
  - 行内逐字 spans 由 `parseSpans` 处理，`<mm:ss>` 包裹的中间标签不增加新行
  - 错误抛 `SplParseError`，包含 `line` 行号
- **`verify(lrcContent: string)`** —— 编辑器校验入口，返回 `{ isValid: true } | { isValid: false, error: SplParseError }`
- **`parseAndMergeLyrics({ lrc, tlyric, romalrc })`** —— 合并三轨歌词，按 `startTime` 对齐，匹配率 < 20% 丢弃
- **`parseYrc(yrcContent: string)`**（`converter/netease.ts`）—— 网易 YRC 逐字格式转 SPL
  - 识别 JSON 行 `{ "t": 1234, "c": [{ "tx": "字" }] }`
  - 识别 `[开始,持续]内容(开始,持续,0)字` 老式 YRC
  - 词间间隔插入显式 `<mm:ss>` 避免被拉长

### 降级策略

1. 网络三源全部失败 → `LyricNotFoundError` → React Query `useSmartFetchLyrics` 把错误转成 `errorMessage` 字段，UI 显示「歌词加载失败：xxx」
2. 离线状态（`isActuallyOffline`）→ 直接返回 `LyricNotFoundError`
3. 解析失败 → `finalLyrics` 为 `null` → UI 显示原始 `lyrics.lrc` 纯文本
4. `manualSkip=true` → 显示「已跳过歌词获取，但你可以重新搜索或编辑歌词」

---

## 4. 状态管理

### 关键设计：歌词**不进 Zustand store**

`useAppStore` 只存**设置**（`lyricSource` / `enableVerbatimLyrics` / `enableOldSchoolStyleLyric`），不存当前歌词数据、不存当前行号。这与 web_app AGENTS.md 中「store 极简化」原则一致。

### 真正的状态分布

| 数据 | 真源 | 访问方式 |
|---|---|---|
| 歌词文件（`LyricFileData`） | 文件系统 + React Query 缓存 | `useSmartFetchLyrics(enabled, track)` |
| 手动搜索结果 | React Query 三并发 | `useManualSearchLyrics(uniqueKey)` |
| 当前行号 `currentLyricIndex` | Reanimated `SharedValue<number>` | `useLyricSync` 内部 |
| 用户偏移 `tempOffset` | React `useState` + `SharedValue` 镜像 | `PlayerLyrics.tsx` |
| `preferredLyricType`（翻译/罗马音） | React `useState` | `PlayerLyrics.tsx` |
| 桌面/状态栏/车机开关 | Orpheus 原生 `GeneralStorage`（Kotlin SharedPreferences） | `Orpheus.isDesktopLyricsShown` 等 |
| 原生 overlay 当前歌词 | `UnifiedLyricsManager` 内部 `sharedLyrics` + `consumerOverrides` | `Orpheus.setLyrics(data, consumers)` |

### 当前行计算（`useLyricSync.ts`）

```ts
// 二分查找当前时间对应的歌词行
const findIndexForTime = (timestamp: number) => {
    let lo = 0, hi = lyrics.length - 1, ans = 0
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (lyrics[mid].startTime / 1000 <= timestamp) { ans = mid; lo = mid + 1 }
        else hi = mid - 1
    }
    return Math.max(0, Math.min(ans, lyrics.length - 1))
}
```

进度更新走 `playerProgressEmitter.subscribe('progress', ...)`（粘性 emitter），每次回调 `currentLyricIndex.set(index)`。**不触发 React 重渲染**，因为 `currentLyricIndex` 是 SharedValue，UI 线程直接通过 `useDerivedValue` 派生。

### 偏移量（offset）调整

- `tempOffset` 状态以 0.5s 步进（`LyricsOffsetControl.tsx` 上下箭头）
- `offsetSharedValue` 镜像用于 UI 线程计算：`adjustedCurrentTime = currentTime - offset`
- 语义：**正偏移 = 歌词延后显示**（解决「歌词太快」问题）
- 点击歌词跳转：`Orpheus.seekTo(lyrics[index].startTime / 1000 + tempOffset)` —— 跳到「歌词时间 + 偏移」
- 关闭面板时 `requestAnimationFrame` 异步写盘 + `queryClient.setQueryData` 立即更新 React Query 缓存（避免等磁盘 IO）

---

## 5. UI 组件

### 组件树

```
player.tsx (PagerView 第二页)
└── PlayerLyrics.tsx (Lyrics)
    ├── MaskedView + LinearGradient (顶/底渐变遮罩)
    ├── Animated.ScrollView
    │   └── map(item, index) →
    │       ├── ModernLyricLineItem (默认)
    │       │   ├── KaraokeWord × N (逐字模式)
    │       │   └── Animated.Text (翻译/罗马音)
    │       └── OldSchoolLyricLineItem (旧版样式)
    │       └── padding_item (底部空白，使最后一行能滚到中间)
    ├── LyricsControlOverlay.tsx (右下角功能菜单 + 滑出控件)
    │   ├── FunctionalMenu (三点菜单：切翻译/罗马音、编辑、时间轴偏移)
    │   ├── PlayerSlider + MainPlaybackControls (滑出式)
    │   └── tapGesture (单击切换控件显示，3s 自动隐藏)
    └── LyricsOffsetControl.tsx (浮动偏移调整面板)
```

### 关键组件 Props

**`LyricLineItemProps`**（`LyricLineItem.tsx`）：

```ts
interface LyricLineItemProps {
    item: LyricLine & { isPaddingItem?: boolean }
    currentHighlightIndex: SharedValue<number>  // 跨线程共享
    jumpToThisLyric: (index: number) => void
    index: number
    onPressBackground?: (() => void) | undefined
    currentTime: SharedValue<number>            // 已减去 offset 的派生值
    enableVerbatimLyrics: boolean
    preferredLyricType?: 'translation' | 'romaji'
}
```

**`KaraokeWordProps`**（`KaraokeWord.tsx`）：

```ts
interface KaraokeWordProps {
    span: LyricSpan
    currentTime: SharedValue<number>
    baseStyle?: StyleProp<TextStyle>
    activeColor: string
    inactiveColor: string
}
```

**`LyricsControlOverlayProps`**（`LyricsControlOverlay.tsx`）：

```ts
interface LyricsControlOverlayProps {
    scrollDirection: SharedValue<'up' | 'down' | 'idle'>
    offsetMenuVisible: boolean
    onOpenActionMenu: (anchor: { x, y, width, height }) => void
    showTranslationToggle: boolean
    translationType: 'translation' | 'romaji'
    onToggleTranslation: () => void
    onEditLyrics: () => void
    onOpenOffsetMenu: () => void
    onControlsVisibilityChange?: (visible: boolean) => void
}
```

**`LyricsOffsetControlProps`**（`LyricsOffsetControl.tsx`）：

```ts
interface LyricsOffsetControlProps {
    visible: boolean
    anchor: { x, y, width, height } | null
    offset: number
    onChangeOffset: (delta: number) => void  // ±0.5s
    onClose: () => void
}
```

**`LyricsShareCardProps`**（`LyricsShareCard.tsx`）：

```ts
interface LyricsShareCardProps {
    title: string
    artistName: string
    imageRef?: ImageRef | null
    shareUrl: string
    selectedLyrics: LyricLine[]
    viewShotRef: RefObject<ViewShotRef | null>
    backgroundColor: string   // 从封面提取的主题色
}
```

### 平滑滚动实现

`Animated.ScrollView` + `onLayout` 收集每行 y 坐标到 `itemLayoutsRef`：

```ts
const scrollToIndex = (index: number, animated = true) => {
    const y = itemLayoutsRef.current[index]
    scrollViewRef.current?.scrollTo({ y: Math.max(0, y - windowHeight * 0.15), animated })
}
```

- 当前行变化通过 `useAnimatedReaction` 在 UI 线程响应（不经过 JS 线程）
- 用户手动拖动时设 `isManualScrollingRef=true`，2s 后自动归位
- 滚动方向检测（`SCROLL_DIRECTION_THRESHOLD = 8` 像素）：上滑隐藏控件，下滑显示控件

### 逐字高亮实现（`KaraokeWord`）

**双 Text 叠加 + Mask 裁剪**：

```
<View style={container}>
    <Text style={[baseStyle, { color: inactiveColor }]}>{span.text}</Text>  // 底层：未高亮色
    <Animated.View style={[mask, { width: layoutWidth * localProgress }]}>  // 上层：高亮色
        <AnimatedText style={[baseStyle, { color: activeColor, width: layoutWidth }]}>
            {span.text}
        </AnimatedText>
    </Animated.View>
</View>
```

- `useAnimatedReaction` 监听 `currentTime`，在 span 起止区间内用 `interpolate` 算进度（0→1）
- `maskStyle.width = layoutWidth * localProgress` 实现从左到右渐变填充
- 上层 Text 用固定 `width: layoutWidth` 防止随 mask 宽度换行

### 交互

- **点击歌词跳转**：`jumpToThisLyric(index)` → `Orpheus.seekTo(...)` + 立即更新 `currentLyricIndex`
- **单击空白**：触发 `onPressBackground` → `jumpTo('main')` 切回主页面
- **长按歌词**：未在 LyricLineItem 实现，分享入口走 `PlayerFunctionalMenu` 菜单 → `LyricsSelectionModal`
- **复制歌词**：未实现
- **桌面歌词设置面板**：单击浮窗展开（播放控制 + 字号 + 配色 + 锁定 + 模式切换 + 清空）

### 桌面端 vs 移动端

BBPlayer 是 React Native 应用，**桌面端无独立实现**。Android 通过 `FloatingLyricsManager` 提供系统级悬浮窗；iOS 未实现桌面歌词（`Platform.OS === 'android'` 守卫）。状态栏歌词也是 Android 专属。

---

## 6. 性能优化

### 跨线程状态共享（核心优化）

所有高频更新的值都用 Reanimated `SharedValue`，**完全绕开 React 重渲染**：

- `currentLyricIndex` —— 当前行号
- `currentTime` —— 播放进度（`useSmoothProgress` 用 `useFrameCallback` 每帧 +16ms 推进）
- `offsetSharedValue` —— 用户偏移
- `gatedCurrentTime` —— `isHighlighted ? currentTime : -1`，**未高亮行不响应时间变化**

### `useSmoothProgress` 平滑进度

```ts
useFrameCallback((frameInfo) => {
    if (!isAppActive.value || !isPlaying.value || !frameInfo.timeSincePreviousFrame) return
    position.value += frameInfo.timeSincePreviousFrame / 1000
})
```

原生只在 200ms 间隔推 `onPositionUpdate` 事件，UI 线程用帧回调插值到 60fps，避免歌词跳动卡顿。

### `KaraokeWord` 性能

- `memo` 包裹，props 不变不重渲染
- 每个 word 独立监听 `currentTime`，但通过 `gatedCurrentTime` 派生值保证**只有当前行**的 word 真正响应
- `layoutWidth` 通过 `onLayout` 一次性测量后存入 SharedValue，避免每帧 measure

### 列表虚拟化

- **主歌词滚动**：未虚拟化（`Animated.ScrollView` + 全量 `map`）—— 歌词行数通常 < 100，虚拟化收益不大且 `onLayout` 测量更直接
- **手动搜索结果**：用 `LegendList`（`@legendapp/list/react-native`，`recycleItems` 开启回收）—— 搜索结果可能很多
- **分享选择列表**：同样用 `LegendList`

### 文件系统缓存

- 路径：`FileSystem.Paths.document/lyrics/{uniqueKey}.json`（uniqueKey 中 `::` 替换为 `--` 避免路径问题）
- 读取用 `Sentry.startSpan` 包装便于性能监控
- 写盘 300ms debounce（`pushLyricsToOverlays` 内部）

### 多源并发取消

`Promise.any` + `AbortController`，任一源成功立即 abort 其余，避免浪费带宽。

### 原生侧优化

- `LyricsTimeline.kt` 用 `indexOfLast` 二分查找当前行（注意：`List.indexOfLast` 是线性扫描，但歌词行数少无影响）
- `OrpheusMusicService.kt` 用 `Handler.postDelayed` 每 200ms 调一次 `lyricsManager.updateTime(seconds)`，所有 consumer 一次 tick
- `LyricView.kt` 自绘 `Canvas`，避免 TextView 重排；逐字高亮用 `canvas.clipRect` + `drawText` 两次（outline + fill）

---

## 7. 历史与缓存

### 存储：**纯文件系统**，不用 SQLite、不用 MMKV

- `apps/mobile/src/lib/db/schema.ts` 中**没有任何 lyric 表**（已确认 grep 无匹配）
- 缓存目录：`expo-file-system` 的 `document/lyrics/`
- 文件名：`{uniqueKey.replace('::', '--')}.json`
- 内容：`JSON.stringify(LyricFileData)`

### 原生侧偏好存储

桌面/状态栏/车机开关、字号、配色、位置、显示模式等用 `GeneralStorage`（Kotlin SharedPreferences 包装，见 `packages/orpheus/android/.../util/GeneralStorage.kt`）。

### 离线访问

- 文件命中即返回，不联网
- `manualSkip=true` 时即使无网络也直接返回（不触发 `fetchFromNetwork`）
- `isActuallyOffline(networkState)` 检测离线后返回 `LyricNotFoundError`，UI 显示错误信息（不崩溃）

### 旧格式迁移

`migrateFromOldFormat()` 处理两种历史格式：
- `ParsedLrc`（有 `rawOriginalLyrics` / `rawTranslatedLyrics`）
- 老版 `{ raw: "主歌词\n\n翻译歌词" }`（用 `\n\n` 分隔）

迁移后写入 `.migration_v2_done` 标记文件，避免每次启动重扫目录。

### 原生消费者缓存

`UnifiedLyricsManager` 维护：
- `sharedLyrics: LyricsData` —— 所有 consumer 共享的歌词
- `consumerOverrides: Map<LyricConsumer, LyricsData>` —— 单独更新的 consumer 覆盖
- `submitLyrics(data, consumers)` 时若 consumers 是全集，则清空 overrides；否则只更新指定 consumer

---

## 设计哲学总结

BBPlayer 歌词系统的设计可以提炼为以下几条原则：

1. **格式优先于实现**：自研 SPL 格式（Salt Player Lyrics，LRC 超集）作为统一中间表示，所有外部源（YRC、QQ、酷狗、LRC）都先转 SPL 再解析。这样新增源只需写 converter，解析逻辑复用。

2. **职责分层清晰**：
   - `@bbplayer/splash` 包：纯函数解析库，无副作用，可独立测试（有完整 jest 测试套件）
   - `@bbplayer/orpheus` 包：原生播放器 + 歌词消费者桥接
   - `lyricService`：编排层，组合多个 API + 文件系统 + 原生桥接
   - React Query：缓存层
   - Reanimated SharedValue：跨线程高频状态

3. **store 极简化**：歌词数据**不进 Zustand**，避免高频更新拖慢整个 app。设置项进 store，运行时数据走 React Query，UI 状态走 SharedValue —— 各取所长。

4. **跨线程优先**：所有 60fps 更新的值（当前行号、播放进度、逐字进度）全部走 Reanimated SharedValue，从原生事件 → UI 线程，**不经 JS 线程**。这是 RN 性能优化的核心套路。

5. **优雅降级链**：网络多源 → 本地缓存 → 离线错误展示 → 纯文本回退 → manualSkip 标记。每一级都有明确语义和 UI 反馈。

6. **编辑能力一等公民**：`EditLyrics` 模态支持三轨分别编辑（主歌词/翻译/罗马音），保存前 `verify()` 校验 SPL 格式，错误精确到行号。用户校时通过 `LyricsOffsetControl` ±0.5s 步进。

7. **原生 overlay 抽象**：`LyricConsumer = 'desktop' | 'statusBar' | 'car'` 三类消费者统一接口，`UnifiedLyricsManager` 支持全集更新和单 consumer 覆盖。状态栏歌词又抽象出三后端（Lyricon / 魅族 / SuperLyric），用 `StatusBarLyricsBackend` 接口隔离。

8. **CI 自动化**：`.github/workflows/check-lyricon-updates.yml` 每天检查上游 Lyricon 仓库，自动创建 Issue + Draft PR，降低三方依赖同步成本。

9. **可观测性**：所有 IO 操作用 `Sentry.startSpan` 包装（`io:file:read` / `io:file:write`），错误用 `toastAndLogError` 同时通知用户和上报 Sentry。

10. **防御性编程**：`parseYrc` 对网易云可能返回非 YRC 格式的 tlyric/romalrc 也调一次 parseYrc（"哥们儿写的规则太屎了"）；`isMatch` 用 20% 匹配率阈值过滤错误翻译；`Promise.any` 的 AggregateError 提取所有源错误信息拼接。

---

## 所有相关文件路径汇总

**文档**
- `E:\xiao_yu\Program\BBPlayer\apps\docs\docs\guides\lyrics.md`
- `E:\xiao_yu\Program\BBPlayer\apps\docs\docs\SPL.md`
- `E:\xiao_yu\Program\BBPlayer\.github\workflows\check-lyricon-updates.yml`

**类型定义**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\types\player\lyrics.ts`
- `E:\xiao_yu\Program\BBPlayer\packages\splash\src\types.ts`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\src\ExpoOrpheusModule.ts`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\model\LyricsModels.kt`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\types\core\appStore.ts`（lyric settings 类型）
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\types\navigation.ts`（ModalPropsMap）

**SPL 解析包（`@bbplayer/splash`）**
- `E:\xiao_yu\Program\BBPlayer\packages\splash\src\index.ts`
- `E:\xiao_yu\Program\BBPlayer\packages\splash\src\parser\index.ts`（parseSpl / verify）
- `E:\xiao_yu\Program\BBPlayer\packages\splash\src\parser\spans.ts`（parseSpans 逐字解析）
- `E:\xiao_yu\Program\BBPlayer\packages\splash\src\parser\merge.ts`（parseAndMergeLyrics）
- `E:\xiao_yu\Program\BBPlayer\packages\splash\src\converter\netease.ts`（parseYrc）
- `E:\xiao_yu\Program\BBPlayer\packages\splash\src\utils\time.ts`

**服务层与 API**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\lib\services\lyricService.ts`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\lib\api\netease\api.ts`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\lib\api\qqmusic\api.ts`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\lib\api\kugou\api.ts`

**React Query 层**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\hooks\queries\lyrics\index.ts`（useSmartFetchLyrics / useManualSearchLyrics）
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\hooks\mutations\lyrics\index.ts`（useFetchLyrics）

**Zustand store**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\hooks\stores\useAppStore.ts`（仅设置项）
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\hooks\stores\useModalStore.ts`（模态开关）

**进度与同步**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\lib\player\progressListener.ts`（粘性 emitter）
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\hooks\player\useSmoothProgress.ts`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\hooks\useLyricSync.ts`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\lib\player\PlayerSideEffects.ts`（onTrackStarted → pushLyricsToOverlays）

**UI 组件**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\app\player.tsx`（入口，PagerView 第二页）
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\PlayerLyrics.tsx`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\lyrics\LyricLineItem.tsx`（Modern + OldSchool 双风格）
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\lyrics\KaraokeWord.tsx`（逐字高亮）
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\LyricsControlOverlay.tsx`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\lyrics\LyricsOffsetControl.tsx`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\PlayerFunctionalMenu.tsx`（搜索/分享入口）

**模态**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\components\modals\lyrics\EditLyrics.tsx`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\components\modals\lyrics\ManualSearchLyrics.tsx`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\components\modals\player\LyricsSelectionModal.tsx`

**分享卡片**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\sharing\LyricsShareCard.tsx`
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\features\player\components\sharing\SongShareCard.tsx`

**设置**
- `E:\xiao_yu\Program\BBPlayer\apps\mobile\src\app\settings\lyrics.tsx`

**原生（`@bbplayer/orpheus`）**
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\src\ExpoOrpheusModule.ts`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\UnifiedLyricsManager.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\FloatingLyricsManager.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\LyricsTimeline.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\StatusBarLyricsManager.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\LyriconBackend.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\MeizuStatusBarLyricsBackend.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\SuperLyricBackend.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\manager\LyricsRuntimeConsumer.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\view\LyricView.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\service\OrpheusMusicService.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\expo\modules\orpheus\util\GeneralStorage.kt`
- `E:\xiao_yu\Program\BBPlayer\packages\orpheus\android\src\main\java\io\github\proify\lyricon\provider\`（词幕 AIDL 集成）
