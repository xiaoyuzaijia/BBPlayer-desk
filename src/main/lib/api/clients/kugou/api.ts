// 酷狗音乐 API 客户端（1:1 复刻 BBPlayer apps/mobile/src/lib/api/kugou/api.ts）
// 改动：
// - import 路径相对化（@/types/... → 相对路径）
// - 错误类型 Error → ThirdPartyError（vendor: 'Kugou'，符合项目错误类层次）
// - fetch 用 Node 全局 fetch（undici），与项目 bilibili client 一致
// - Base64 解码：crypto-js → Node 原生 Buffer（环境适配，非去掉字段处理）
//   crypto-js 在 RN 环境无 Buffer 时必需，Node 环境有原生 Buffer 更轻量
import { errAsync, ResultAsync } from 'neverthrow'

import type {
	KugouLyricDownloadResponse,
	KugouLyricSearchResponse,
	KugouSearchResponse,
} from '../../../../types/kugou'
import type {
	LyricProviderResponseData,
	LyricSearchResult,
} from '../../../../types/lyric'
import { ThirdPartyError } from '../../../errors'
import log from '../../../utils/log'

const logger = log.extend('API.Kugou')

/**
 * 把未知错误包装成 ThirdPartyError
 */
function toKugouError(
	message: string,
	type: 'RequestFailed' | 'ResponseFailed',
	cause: unknown,
): ThirdPartyError {
	return new ThirdPartyError(message, { vendor: 'Kugou', type, cause })
}

export class KugouApi {
	private getHeaders() {
		return {
			'User-Agent': 'IPhone-8990-searchSong',
			'UNI-UserAgent': 'iOS11.4-Phone8990-1009-0-WiFi',
		}
	}

	/**
	 * 搜索歌曲
	 * @param keyword 搜索关键词
	 * @param limit 返回条数（默认 10）
	 * @param signal AbortSignal
	 */
	search(
		keyword: string,
		limit = 10,
		signal?: AbortSignal,
	): ResultAsync<LyricSearchResult, ThirdPartyError> {
		const params = new URLSearchParams({
			api_ver: '1',
			area_code: '1',
			correct: '1',
			pagesize: limit.toString(),
			plat: '2',
			tag: '1',
			sver: '5',
			showtype: '10',
			page: '1',
			keyword: keyword,
			version: '8990',
		})

		const url = `http://mobilecdn.kugou.com/api/v3/search/song?${params.toString()}`

		return ResultAsync.fromPromise(
			fetch(url, { headers: this.getHeaders(), signal }).then((res) => {
				if (!res.ok) {
					throw new Error(`Kugou API error: ${res.statusText}`)
				}
				return res.json() as Promise<KugouSearchResponse>
			}),
			(e) => toKugouError('Failed to search Kugou', 'RequestFailed', e),
		).map((res) => {
			if (res.status !== 1 || !res.data?.info) {
				return []
			}
			return res.data.info.map((song) => ({
				source: 'kugou' as const,
				duration: song.duration,
				title: song.songname || song.filename,
				artist: song.singername,
				remoteId: song.hash,
			}))
		})
	}

	/**
	 * 获取歌词（两步流程：search 拿 candidate → download 拿 Base64 content）
	 * @param id 歌曲 hash
	 * @param signal AbortSignal
	 * @returns 原始 lrc 字符串
	 */
	getLyrics(
		id: string,
		signal?: AbortSignal,
	): ResultAsync<string, ThirdPartyError> {
		// Step 1: 搜索歌词候选
		const searchParams = new URLSearchParams({
			keyword: '%20-%20',
			ver: '1',
			hash: id,
			client: 'mobi',
			man: 'yes',
		})
		const searchUrl = `http://krcs.kugou.com/search?${searchParams.toString()}`

		return ResultAsync.fromPromise(
			fetch(searchUrl, { signal }).then(
				(res) => res.json() as Promise<KugouLyricSearchResponse>,
			),
			(e) =>
				toKugouError('Failed to search lyric candidate on Kugou', 'RequestFailed', e),
		).andThen((searchRes) => {
			if (!searchRes.candidates || searchRes.candidates.length === 0) {
				return errAsync(
					toKugouError('No lyric candidates found on Kugou', 'ResponseFailed', null),
				)
			}

			const candidate = searchRes.candidates[0]

			// Step 2: 下载歌词
			const downloadParams = new URLSearchParams({
				charset: 'utf8',
				accesskey: candidate.accesskey,
				id: candidate.id,
				client: 'mobi',
				fmt: 'lrc',
				ver: '1',
			})
			const downloadUrl = `http://lyrics.kugou.com/download?${downloadParams.toString()}`

			return ResultAsync.fromPromise(
				fetch(downloadUrl, { signal }).then(
					(res) => res.json() as Promise<KugouLyricDownloadResponse>,
				),
				(e) => toKugouError('Failed to download lyric from Kugou', 'RequestFailed', e),
			).map((downloadRes) => {
				// Base64 解码：用 Node 原生 Buffer 替代 crypto-js
				const raw = downloadRes.content
				return Buffer.from(raw, 'base64').toString('utf-8')
			})
		})
	}

	/**
	 * 解析酷狗歌词
	 * 酷狗不提供翻译/罗马音，tlyric / romalrc 恒为 undefined
	 */
	parseLyrics(content: string): LyricProviderResponseData {
		return {
			lrc: content,
			tlyric: undefined,
			romalrc: undefined,
		}
	}

	/**
	 * 搜索并获取最佳匹配的歌词
	 * 策略与 QQ 一致：top 5 候选里找时长差 ≤3 秒的，找不到用第一条
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
					toKugouError('No songs found on Kugou', 'ResponseFailed', null),
				)
			}

			const targetDurationSeconds = Math.round(durationMs / 1000)
			let bestMatch = songs[0]
			const MAX_DURATION_DIFF = 3
			const candidates = songs.slice(0, 5)

			const exactMatch = candidates.find(
				(s) =>
					Math.abs(s.duration - targetDurationSeconds) <= MAX_DURATION_DIFF,
			)

			if (exactMatch) {
				bestMatch = exactMatch
			} else {
				logger.debug(
					`No exact duration match found. Using first result: ${bestMatch.title}`,
				)
			}

			return this.getLyrics(bestMatch.remoteId as string, signal).map(
				(content) => this.parseLyrics(content),
			)
		})
	}
}

export const kugouApi = new KugouApi()
