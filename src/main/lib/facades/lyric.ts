// LyricFacade
// 跨资源编排：trackService + bilibiliApi + (neteaseApi | qqMusicApi | kugouApi) + lyricService
//
// 职责：根据 trackId 返回歌词数据（优先本地缓存，未命中则多源竞速 + B 站歌名反查）
//
// 关键决策（详见 docs/plan/9-歌词计划.md）：
// - Q10：B 站歌名反查 —— bilibili 源 track 先调 getWebPlayerInfo 拿 bgm_info.music_title
//   优先匹配《》内的歌名，没有则用整个 music_title
// - Q17：多源竞速用 Promise.any + AbortController（与 BBPlayer 一致）
// - Q16：编排放本 facade，lyricService 只做文件 CRUD
// - 不做 manualSkip / userOffset / preload / 手动搜索（Q5/Q6/Q8/Q9）
// - auto 竞速组成：网易 + 酷狗。QQ 音乐需账号登录、端点基本不可用，移出 auto 仅手动可选
//
// 错误类型：FacadeError + ServiceError + DatabaseError + BilibiliApiError + ThirdPartyError + LyricNotFoundError
// IPC 边界再转 Result
import { errAsync, okAsync, ResultAsync } from 'neverthrow'

import { bilibiliApi } from '../api/clients/bilibili/api'
import { kugouApi } from '../api/clients/kugou/api'
import { neteaseApi } from '../api/clients/netease/api'
import { qqMusicApi } from '../api/clients/qqmusic/api'
import {
  DatabaseError,
  FacadeError,
  LyricNotFoundError,
  ServiceError,
  ThirdPartyError,
} from '../errors'
import type { LyricFileData } from '../services/lyricService'
import type { LyricService } from '../services/lyricService'
import { getLyricService, getTrackService } from '../services'
import type { Track } from '../services/types'
import type { LyricProviderResponseData } from '../../types/lyric'
import type { LyricSource } from '../../../shared/ipc-types'
import log from '../utils/log'

const logger = log.extend('Facade.Lyric')

/**
 * LyricFacade 可能返回的错误
 */
export type LyricFacadeError =
  | FacadeError
  | ServiceError
  | DatabaseError
  | ThirdPartyError
  | LyricNotFoundError

/**
 * getWebPlayerInfo 返回 unknown，这里定义需要的子集类型
 * 对应 BBPlayer BilibiliWebPlayerInfo
 */
interface BilibiliWebPlayerInfo {
  bgm_info?: {
    music_id: number
    music_title: string
    jump_url: string
  }
}

/**
 * 清洗搜索关键词
 * 1:1 复刻 BBPlayer LyricService.cleanKeyword
 * - 优先提取《》或「」内的歌名
 * - 否则去掉【】和双引号包裹的内容，trim 后若为空则用原 keyword
 */
function cleanKeyword(keyword: string): string {
  const priorityRegex = /《(.+?)》|「(.+?)」/
  const priorityMatch = priorityRegex.exec(keyword)

  if (priorityMatch) {
    logger.debug('匹配到优先提取的标记，直接返回这段字符串作为 keyword', {
      matched: priorityMatch[1] || priorityMatch[2],
    })
    return priorityMatch[1] || priorityMatch[2]
  }

  const replacedKeyword = keyword.replace(/【.*?】|“.*?”/g, '').trim()
  const result = replacedKeyword.length > 0 ? replacedKeyword : keyword
  logger.debug('最终 keyword 清洗后', { result })
  return result
}

export class LyricFacade {
  private readonly lyricService: LyricService

  constructor(lyricService: LyricService) {
    this.lyricService = lyricService
  }

  /**
   * 主入口：获取 track 的歌词
   *
   * 流程：
   * 1. 查 track（trackService.getTrackById）
   * 2. 查本地缓存（lyricService.getLyricFile）—— 命中（lrc 或 errorMessage）直接返回
   * 3. 未命中：
   *    - bilibili 源：先调 getPreciseMusicNameOnBilibiliVideo 反查歌名
   *    - 调 getBestMatchedLyrics 多源竞速
   *    - 写回 lyricService.saveLyricFile
   *
   * @param trackId track.id（DB 主键）
   * @param source 歌词源偏好，默认 'auto'（多源竞速）
   */
  getLyrics(
    trackId: number,
    source: LyricSource = 'auto',
  ): ResultAsync<LyricFileData, LyricFacadeError> {
    const trackService = getTrackService()
    return trackService.getTrackById(trackId).andThen((track) => {
      // 1. 查本地缓存
      return this.lyricService
        .getLyricFile(track.uniqueKey)
        .andThen((cached) => {
          if (cached) {
            logger.debug(`track ${trackId} 命中歌词缓存`)
            return okAsync(cached)
          }
          // 2. cache miss → 网络获取
          return this.fetchFromNetwork(track, source)
        })
    })
  }

  /**
   * 网络获取歌词
   * bilibili 源先反查歌名，再调 getBestMatchedLyrics
   */
  private fetchFromNetwork(
    track: Track,
    source: LyricSource,
  ): ResultAsync<LyricFileData, LyricFacadeError> {
    // bilibili 源特殊处理：调 getWebPlayerInfo 反查 bgm_info.music_title
    if (track.source === 'bilibili') {
      return ResultAsync.fromSafePromise(
        this.getPreciseMusicNameOnBilibiliVideo(track),
      ).andThen((preciseKeyword) => {
        return this.getBestMatchedLyrics(
          track,
          preciseKeyword,
          source,
        ).andThen((lyrics) => this.processAndSaveLyrics(lyrics, track))
      })
    }

    // local 源：直接用 track.title
    return this.getBestMatchedLyrics(track, undefined, source).andThen(
      (lyrics) => this.processAndSaveLyrics(lyrics, track),
    )
  }

  /**
   * 多源竞速获取最佳匹配歌词
   * 1:1 复刻 BBPlayer LyricService.getBestMatchedLyrics（auto 组成调整：网易 + 酷狗）
   *
   * 策略：
   * - auto：网易 + 酷狗并行，Promise.any 取首个成功，abort 其余
   *   （QQ 音乐需账号登录、端点基本不可用，移出 auto）
   * - netease / qqmusic / kugou：单源
   * - 全部失败 → LyricNotFoundError
   *
   * @param track 曲目（用 track.title 作 fallback keyword，track.duration*1000 作目标时长）
   * @param preciseKeyword 精确关键词（B 站反查得到），不传则用 cleanKeyword(track.title)
   * @param source 歌词源偏好
   */
  private getBestMatchedLyrics(
    track: Track,
    preciseKeyword: string | undefined,
    source: LyricSource,
  ): ResultAsync<LyricProviderResponseData, LyricNotFoundError> {
    const keyword = preciseKeyword ?? cleanKeyword(track.title)
    const durationMs = track.duration * 1000

    // 用 AbortController 数组，某源成功时 abort 其余（与 BBPlayer 一致）
    const controllers: AbortController[] = []

    const createProviderPromise = (
      apiCall: (
        signal: AbortSignal,
      ) => ResultAsync<LyricProviderResponseData, ThirdPartyError>,
      providerName: string,
    ): Promise<LyricProviderResponseData> => {
      const controller = new AbortController()
      controllers.push(controller)

      return apiCall(controller.signal)
        .map((res) => {
          logger.debug(`${providerName} 返回歌词`)
          // 某源成功，abort 其余
          for (const c of controllers) {
            if (c !== controller) c.abort()
          }
          return res
        })
        .match(
          (v) => v,
          (e) => {
            throw e
          },
        )
    }

    const providers: Promise<LyricProviderResponseData>[] = []

    if (source === 'netease' || source === 'auto') {
      providers.push(
        createProviderPromise(
          (signal) =>
            neteaseApi.searchBestMatchedLyrics(keyword, durationMs, signal),
          'Netease',
        ),
      )
    }

    if (source === 'qqmusic') {
      providers.push(
        createProviderPromise(
          (signal) =>
            qqMusicApi.searchBestMatchedLyrics(keyword, durationMs, signal),
          'QQMusic',
        ),
      )
    }

    if (source === 'kugou' || source === 'auto') {
      providers.push(
        createProviderPromise(
          (signal) => kugouApi.searchBestMatchedLyrics(keyword, durationMs, signal),
          'Kugou',
        ),
      )
    }

    // source 是 LyricSource 联合类型，理论上至少会 push 一个 provider
    // 但 TypeScript 不知道，这里加运行时保护
    if (providers.length === 0) {
      return errAsync(
        new LyricNotFoundError(`未选择任何歌词源（source=${source}）`, {
          data: { source },
        }),
      )
    }

    return ResultAsync.fromPromise(
      Promise.any(providers),
      (e) => {
        const aggregateError = e as AggregateError
        const errors = Array.from(aggregateError.errors || [])
        const errorMessages = errors
          .map((err) => (err instanceof Error ? err.message : String(err)))
          .join('; ')
        return new LyricNotFoundError(
          `所有歌词源都失败（${errors.length} 个源）。${errorMessages}`,
          { cause: e },
        )
      },
    )
  }

  /**
   * 把网络返回的歌词数据写回文件缓存
   * 与 BBPlayer LyricService.processAndSaveLyrics 一致
   */
  private processAndSaveLyrics(
    lyrics: LyricProviderResponseData,
    track: Track,
  ): ResultAsync<LyricFileData, LyricFacadeError> {
    const lyricFileData: LyricFileData = {
      ...lyrics,
      id: track.uniqueKey,
      updateTime: Date.now(),
    }
    logger.info('网络搜索歌词完成，正在写入缓存', { uniqueKey: track.uniqueKey })
    return this.lyricService
      .saveLyricFile(lyricFileData, track.uniqueKey)
      .mapErr((e) => e as LyricFacadeError)
  }

  /**
   * 从 B 站视频反查精确歌名
   * 1:1 复刻 BBPlayer LyricService.getPreciseMusicNameOnBilibiliVideo
   *
   * 流程：
   * 1. bilibiliApi.getWebPlayerInfo({ bvid, cid })
   * 2. 取 res.bgm_info?.music_title（可能为 undefined）
   * 3. 优先匹配《》内的歌名，没有则用整个 music_title
   * 4. 失败返回 undefined（上层用 track.title 兜底）
   *
   * @param track bilibili 源 track
   * @returns 精确歌名 | undefined（cid 为 null 或 API 失败时）
   */
  private async getPreciseMusicNameOnBilibiliVideo(
    track: Extract<Track, { source: 'bilibili' }>,
  ): Promise<string | undefined> {
    const { cid, bvid } = track.bilibiliMetadata
    if (cid === null) return undefined

    const result = await bilibiliApi
      .getWebPlayerInfo({ bvid, cid })
      .andThen((rawData) => {
        const data = rawData as BilibiliWebPlayerInfo
        if (!data.bgm_info) {
          return errAsync(new Error('没有获取到 bgm_info'))
        }
        const filteredResult = /《(.+?)》/.exec(data.bgm_info.music_title)
        logger.debug('从 bilibili 获取到的歌曲名', {
          music_title: data.bgm_info.music_title,
        })
        if (filteredResult?.[1]) {
          return okAsync(filteredResult[1])
        }
        return okAsync(data.bgm_info.music_title)
      })

    if (result.isErr()) {
      logger.debug('反查 B 站歌名失败，用 track.title 兜底', {
        title: track.title,
        error: result.error.message,
      })
      return undefined
    }
    return result.value
  }

  /**
   * 清空所有歌词缓存（设置页"清除缓存"用）
   */
  async clearAllLyrics(): Promise<ResultAsync<true, LyricFacadeError>> {
    return (await this.lyricService.clearAllLyrics()).mapErr(
      (e) => e as LyricFacadeError,
    )
  }
}

// ##################################
// 模块级单例
// ##################################

let facadeInstance: LyricFacade | null = null

/**
 * 初始化 LyricFacade 单例
 * 必须在 services ensureInit 之后调用（依赖 lyricService 单例）
 */
export function initLyricFacade(): LyricFacade {
  facadeInstance = new LyricFacade(getLyricService())
  return facadeInstance
}

/**
 * 获取已初始化的 LyricFacade 单例
 * 未初始化时抛错
 */
export function getLyricFacade(): LyricFacade {
  if (!facadeInstance) {
    throw new Error('[LyricFacade] 未初始化，请先调用 initLyricFacade()')
  }
  return facadeInstance
}

