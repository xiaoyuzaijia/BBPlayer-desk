/**
 * 歌词相关类型
 *
 * `LyricLine` / `LyricSpan` / `SplLyricData` 直接从 splash 包 re-export，
 * 保证渲染进程各处使用的类型与解析器输出严格一致。
 *
 * splash 源自 BBPlayer `packages/splash/`，1:1 复刻，详见 docs/plan/9-歌词计划.md。
 */
export type { LyricLine, LyricSpan, SplLyricData } from '../utils/splash/src/types'

/**
 * 歌词文件持久化结构（与主进程 `userData/lyrics/{uniqueKey}.json` 对齐）
 *
 * 与 BBPlayer `LyricFileData` 的差异：
 * - 去掉 `manualSkip`（Q8 决策不做跳过标记）
 * - 去掉 `misc.userOffset`（Q5 决策不做偏移量）
 *
 * 保留 `tlyric` / `romalrc` 字段：QQ 音乐返回的 trans 已用于解析合并，
 * romalrc 各源均不返回，仅与 BBPlayer 对齐保留。
 */
export interface LyricFileData {
	/** 曲目唯一 ID（track.uniqueKey） */
	id: string
	/** 缓存写入时间（ms epoch） */
	updateTime: number
	/** 主歌词（SPL 格式字符串，渲染进程调 parseAndMergeLyrics 解析为 LyricLine[]） */
	lrc?: string
	/** 翻译歌词（SPL 格式字符串，QQ 音乐可能返回，酷狗恒为 undefined） */
	tlyric?: string
	/** 罗马音歌词（QQ/酷狗均不返回，保留字段与 BBPlayer 对齐） */
	romalrc?: string
	/** 获取失败时的展示文本（多源全失败时落盘，避免反复重试） */
	errorMessage?: string
}
