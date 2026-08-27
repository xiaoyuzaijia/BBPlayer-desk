// 网易云音乐 API 客户端（1:1 复刻 BBPlayer apps/mobile/src/lib/api/netease/api.ts）
// 改动：
// - import 路径相对化（@/types/... → 相对路径）
// - NeteaseApiError → ThirdPartyError（vendor: 'Netease'，与 kugou/qqmusic client 一致）
// - parseYrc 从 @bbplayer/splash → 本地 ./yrc（主/渲染 bundle 隔离，无法共享渲染进程代码）
// - 不迁移 getPlaylist（外部歌单功能，本项目无此功能）
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'

import type {
	NeteaseLyricResponse,
	NeteaseSearchResponse,
} from '../../../../types/netease'
import type {
	LyricProviderResponseData,
	LyricSearchResult,
} from '../../../../types/lyric'
import { ThirdPartyError } from '../../../errors'

import type { RequestOptions } from './request'
import { createRequest } from './request'
import { createOption } from './utils'
import { parseYrc } from './yrc'

interface SearchParams {
	keywords: string
	type?: number | string
	limit?: number
	offset?: number
}

export class NeteaseApi {
	getLyrics(
		id: number,
		signal?: AbortSignal,
	): ResultAsync<NeteaseLyricResponse, ThirdPartyError> {
		const data = {
			id: id,
			lv: -1,
			tv: -1,
			rv: -1,
			kv: -1,
			yv: -1,
			os: 'ios',
			ver: 1,
		}
		const requestOptions: RequestOptions = createOption(
			{
				crypto: 'eapi',
				cookie: {
					os: 'ios',
					appver: '8.7.01',
					osver: '16.3',
					deviceId: '265B59C3-C5DE-4876-8A33-FD52CD5C2960',
				},
			},
			'eapi',
		)
		if (signal) {
			requestOptions.signal = signal
		}
		return createRequest<object, NeteaseLyricResponse>(
			'/api/song/lyric/v1',
			data,
			requestOptions,
		).map((res) => res.body)
	}

	search(
		params: SearchParams,
		signal?: AbortSignal,
	): ResultAsync<LyricSearchResult, ThirdPartyError> {
		const type = params.type ?? 1
		const endpoint =
			type === '2000' ? '/api/search/voice/get' : '/api/cloudsearch/pc'

		const data = {
			type: type,
			limit: params.limit ?? 30,
			offset: params.offset ?? 0,
			...(type === '2000'
				? { keyword: params.keywords }
				: { s: params.keywords }),
		}

		const requestOptions: RequestOptions = createOption({}, 'weapi')
		if (signal) {
			requestOptions.signal = signal
		}
		return createRequest<object, NeteaseSearchResponse>(
			endpoint,
			data,
			requestOptions,
		).map((res) => {
			if (!res.body.result?.songs) return []
			return res.body.result.songs.map((song) => ({
				source: 'netease' as const,
				duration: song.dt / 1000,
				title: song.name,
				artist: song.ar[0].name,
				remoteId: song.id,
			}))
		})
	}

	public parseLyrics(
		lyricsResponse: NeteaseLyricResponse,
	): LyricProviderResponseData {
		const yrcLyric = lyricsResponse.yrc?.lyric
		const haveYrc = !!yrcLyric
		const lrc = haveYrc ? yrcLyric : lyricsResponse.lrc.lyric
		const tlrc = haveYrc
			? lyricsResponse.ytlrc?.lyric
			: lyricsResponse.tlyric?.lyric
		const romalrc = haveYrc
			? lyricsResponse.yromalrc?.lyric
			: lyricsResponse.romalrc?.lyric
		const lyricData: LyricProviderResponseData = {
			// 一手防御性编程，我们不确定 tlyric 和 romalrc 会不会返回 yrc 格式，但是 parse 一下准没错
			lrc: parseYrc(lrc),
			tlyric: tlrc ? parseYrc(tlrc) : undefined,
			romalrc: romalrc ? parseYrc(romalrc) : undefined,
		}

		return lyricData
	}

	public searchBestMatchedLyrics(
		keyword: string,
		_targetDurationMs: number,
		signal?: AbortSignal,
	): ResultAsync<LyricProviderResponseData, ThirdPartyError> {
		return this.search({ keywords: keyword, limit: 10 }, signal).andThen(
			(searchResult) => {
				if (searchResult.length === 0) {
					return errAsync(
						new ThirdPartyError(
							'未搜索到相关歌曲\n\n搜索关键词：' + keyword,
							{
								vendor: 'Netease',
								type: 'SearchResultNoMatch',
							},
						),
					)
				}

				// const bestMatch = this.findBestMatch(songs, keyword, targetDurationMs)
				// 相信网易云... 哥们儿写的规则太屎了
				const bestMatch = searchResult[0]

				return this.getLyrics(bestMatch.remoteId as number, signal).andThen(
					(lyricsResponse) => {
						const lyricData = this.parseLyrics(lyricsResponse)
						return okAsync(lyricData)
					},
				)
			},
		)
	}
}

export const neteaseApi = new NeteaseApi()
