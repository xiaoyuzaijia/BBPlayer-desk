// 酷狗音乐 API 响应类型（1:1 复刻 BBPlayer apps/mobile/src/types/apis/kugou.ts）

export interface KugouSearchResponse {
	status: number
	data: {
		info: {
			hash: string
			filename: string
			album_name: string
			duration: number // 时长（秒）
			singername: string
			songname: string
		}[]
		total: number
	}
}

export interface KugouLyricSearchResponse {
	status: number
	candidates: {
		id: string
		accesskey: string
		fmt: string
		duration: number
		singer: string
		song: string
	}[]
}

export interface KugouLyricDownloadResponse {
	status: number
	content: string // Base64 编码的 lrc
	fmt: string
}
