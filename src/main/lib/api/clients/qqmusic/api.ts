// QQ 音乐 API 客户端（1:1 复刻 BBPlayer apps/mobile/src/lib/api/qqmusic/api.ts）
// 改动：
// - import 路径相对化（@/types/... → 相对路径）
// - 错误类型 Error → ThirdPartyError（vendor: 'QQMusic'，符合项目错误类层次）
// - fetch 用 Node 全局 fetch（undici），与项目 bilibili client 一致
import { decode } from 'he'
import { errAsync, ResultAsync } from 'neverthrow'

import type {
	QQMusicLyricResponse,
	QQMusicPlaylistResponse,
	QQMusicSearchResponse,
} from '../../../../types/qqmusic'
import type {
	LyricProviderResponseData,
	LyricSearchResult,
} from '../../../../types/lyric'
import { ThirdPartyError } from '../../../errors'
import log from '../../../utils/log'

const logger = log.extend('API.QQMusic')

/**
 * 把未知错误包装成 ThirdPartyError
 * 网络层错误 type='RequestFailed'，响应解析错误 type='ResponseFailed'
 */
function toQQMusicError(
	message: string,
	type: 'RequestFailed' | 'ResponseFailed',
	cause: unknown,
): ThirdPartyError {
	return new ThirdPartyError(message, { vendor: 'QQMusic', type, cause })
}

export class QQMusicApi {
	/**
	 * 搜索歌曲
	 * @param keyword 搜索关键词
	 * @param limit 返回条数（默认 10）
	 * @param signal AbortSignal，用于多源竞速时取消
	 */
	search(
		keyword: string,
		limit = 10,
		signal?: AbortSignal,
	): ResultAsync<LyricSearchResult, ThirdPartyError> {
		const searchType = 0 // 0 for song
		const pageNum = 1

		const body = {
			comm: {
				ct: '19',
				cv: '1859',
				uin: '0',
			},
			req: {
				method: 'DoSearchForQQMusicDesktop',
				module: 'music.search.SearchCgiService',
				param: {
					grp: 1,
					num_per_page: limit,
					page_num: pageNum,
					query: keyword,
					search_type: searchType,
				},
			},
		}

		return ResultAsync.fromPromise(
			fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
				method: 'POST',
				body: JSON.stringify(body),
				headers: {
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
					Accept: 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
					Referer: 'https://y.qq.com/',
				},
				signal,
			}).then((res) => {
				if (!res.ok) {
					throw new Error(`QQ Music API error: ${res.statusText}`)
				}
				return res.json() as Promise<QQMusicSearchResponse>
			}),
			(e) => toQQMusicError('Failed to search QQ Music', 'RequestFailed', e),
		).map((res) => {
			const list = res.req.data.body.song.list
			return list.map((song) => ({
				source: 'qqmusic' as const,
				duration: song.interval,
				title: song.name,
				artist: song.singer[0]?.name ?? 'Unknown',
				remoteId: song.mid,
			}))
		})
	}

	/**
	 * 获取歌词（含翻译）
	 * @param songmid 歌曲 mid
	 * @param signal AbortSignal
	 */
	getLyrics(
		songmid: string,
		signal?: AbortSignal,
	): ResultAsync<QQMusicLyricResponse, ThirdPartyError> {
		const url = `https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1`

		return ResultAsync.fromPromise(
			fetch(url, {
				headers: {
					Referer: 'https://y.qq.com/',
				},
				signal,
			}).then((res) => {
				if (!res.ok) {
					throw new Error(`QQ Music API error: ${res.statusText}`)
				}
				return res.json() as Promise<QQMusicLyricResponse>
			}),
			(e) =>
				toQQMusicError('Failed to fetch lyrics from QQ Music', 'RequestFailed', e),
		)
	}

	/**
	 * 解析 QQ 音乐歌词响应
	 * lyric / trans 都是 HTML 实体编码的字符串，用 he.decode 解码
	 * romalrc 永远 undefined（QQ 音乐不提供罗马音）
	 */
	parseLyrics(response: QQMusicLyricResponse): LyricProviderResponseData {
		const rawLyrics = response.lyric ? decode(response.lyric) : undefined
		const transLyrics = response.trans ? decode(response.trans) : undefined

		return {
			lrc: rawLyrics,
			tlyric: transLyrics,
			romalrc: undefined,
		}
	}

	/**
	 * 搜索并获取最佳匹配的歌词
	 * 策略：top 5 候选里找时长差 ≤3 秒的，找不到用第一条
	 * @param keyword 搜索关键词
	 * @param durationMs 目标时长（毫秒）
	 * @param signal AbortSignal
	 */
	searchBestMatchedLyrics(
		keyword: string,
		durationMs: number,
		signal?: AbortSignal,
	): ResultAsync<LyricProviderResponseData, ThirdPartyError> {
		return this.search(keyword, 10, signal).andThen((songs) => {
			if (!songs || songs.length === 0) {
				return errAsync(
					toQQMusicError('No songs found on QQ Music', 'ResponseFailed', null),
				)
			}

			// 简单匹配策略：优先时长匹配
			const targetDurationSeconds = Math.round(durationMs / 1000)

			// 搜索相关性通常不错，默认用第一条
			let bestMatch = songs[0]

			// 在 top 5 里找更接近的时长
			const MAX_DURATION_DIFF = 3 // 秒
			const candidates = songs.slice(0, 5)

			const exactMatch = candidates.find(
				(s) =>
					Math.abs(s.duration - targetDurationSeconds) <= MAX_DURATION_DIFF,
			)

			if (exactMatch) {
				bestMatch = exactMatch
			} else {
				logger.debug(
					`No exact duration match found. Using first result: ${bestMatch.title} (${bestMatch.duration}s) vs target ${targetDurationSeconds}s`,
				)
			}

			return this.getLyrics(bestMatch.remoteId as string, signal).map(
				(response) => this.parseLyrics(response),
			)
		})
	}

	/**
	 * 获取歌单（1:1 复刻 BBPlayer，本计划不使用但保留）
	 * @param id 歌单 id
	 */
	getPlaylist(
		id: string,
	): ResultAsync<QQMusicPlaylistResponse, ThirdPartyError> {
		const params = new URLSearchParams({
			id,
			format: 'json',
			newsong: '1',
			platform: 'jqspaframe.json',
		})

		const url = `https://c.y.qq.com/v8/fcg-bin/fcg_v8_playlist_cp.fcg?${params.toString()}`

		return ResultAsync.fromPromise(
			fetch(url, {
				headers: {
					Referer: 'http://y.qq.com',
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
				},
			}).then((res) => {
				if (!res.ok) {
					throw new Error(`QQ Music API error: ${res.statusText}`)
				}
				return res.json() as Promise<QQMusicPlaylistResponse>
			}),
			(e) =>
				toQQMusicError('Failed to fetch playlist from QQ Music', 'RequestFailed', e),
		)
	}
}

export const qqMusicApi = new QQMusicApi()
