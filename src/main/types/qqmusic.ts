// QQ 音乐 API 响应类型（1:1 复刻 BBPlayer apps/mobile/src/types/apis/qqmusic.ts）

export interface QQMusicSearchResponse {
	code: number
	req: {
		code: number
		data: {
			body: {
				song: {
					list: QQMusicSong[]
				}
			}
		}
		meta: {
			cid: number
			curpage: number
			dir: string
			display_num: number
			ein: number
			next_page: number
			next_page_start: number
			num: number
			num_per_page: number
			p: number
			sin: number
			sum: number
			total_num: number
			uid: string
		}
	}
}

export interface QQMusicSong {
	id: number
	mid: string
	name: string
	title: string
	subtitle: string
	singer: {
		id: number
		mid: string
		name: string
		title: string
		type: number
		uin: number
	}[]
	album: {
		id: number
		mid: string
		name: string
		title: string
		subtitle: string
		time_public: string
		pmid: string
	}
	mv: {
		id: number
		vid: string
		name: string
		title: string
		vt: number
	}
	interval: number // 时长（秒）
	// ... 还有很多其他字段，但我们主要需要 id / mid / name / singer / interval
}

export interface QQMusicLyricResponse {
	retcode: number
	code: number
	subcode: number
	lyric: string
	trans: string
}

export interface QQMusicPlaylistResponse {
	code: number
	data: {
		cdlist: QQMusicPlaylist[]
	}
}

export interface QQMusicPlaylist {
	disstid: string
	dissname: string
	desc: string
	songnum: number
	logo: string
	nickname: string
	songlist: QQMusicSong[]
}
