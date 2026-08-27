// 网易云音乐 API 响应类型（1:1 复刻 BBPlayer apps/mobile/src/types/apis/netease.ts）
// 仅保留歌词系统所需类型，外部歌单（getPlaylist）相关类型不迁移

export interface NeteaseSong {
	id: number
	name: string
	ar: NeteaseArtist[]
	alia: string[] // Alias
	al: NeteaseAlbum
	dt: number // Duration
	tns?: string[] // Translated names
}

export interface NeteaseArtist {
	id: number
	name: string
	tns: string[]
	alias: string[]
}

export interface NeteaseAlbum {
	id: number
	name: string
	picUrl: string
	tns: string[]
}

export interface NeteaseLyricResponse {
	lrc: {
		version: number
		lyric: string
	}
	/** 翻译歌词 */
	tlyric?: {
		version: number
		lyric: string
	}
	/** 罗马音歌词 */
	romalrc?: {
		version: number
		lyric: string
	}
	/** 逐字歌词 (Verbatim) */
	yrc?: {
		version: number
		lyric: string
	}
	/** 与 yrc 相对应的翻译歌词，如果使用 yrc 就必须用这个，否则时间戳对应不上 */
	ytlrc?: {
		version: number
		lyric: string
	}
	/** 与 yrc 相对应的罗马音歌词，如果使用 yrc 就必须用这个，否则时间戳对应不上 */
	yromalrc?: {
		version: number
		lyric: string
	}
	code: number
}

export interface NeteaseSearchResponse {
	result: {
		songs: NeteaseSong[]
	}
	code: number
}
