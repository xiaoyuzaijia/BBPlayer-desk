// 歌词相关主进程内部类型（不跨 IPC，IPC 类型在 src/shared/ipc-types.ts）
// 1:1 复刻 BBPlayer apps/mobile/src/types/player/lyrics.ts 中的 LyricProviderResponseData / LyricSearchResult
// 去掉 netease 分支（Q1 决策不做网易云）

/**
 * 歌词搜索结果项
 * qqmusic / kugou 的 remoteId 都是 string（网易是 number，已去掉）
 */
export type LyricSearchResult = (
	| {
			source: 'qqmusic'
			duration: number // 秒
			title: string
			artist: string
			remoteId: string
	  }
	| {
			source: 'kugou'
			duration: number // 秒
			title: string
			artist: string
			remoteId: string
	  }
)[]

/**
 * 歌词提供者返回的数据结构
 * 与 LyricFileData 的区别：无 id / updateTime / errorMessage
 * 三个字段都是 SPL 格式字符串，由渲染进程调 parseAndMergeLyrics 解析
 */
export interface LyricProviderResponseData {
	lrc?: string
	tlyric?: string
	romalrc?: string
}
