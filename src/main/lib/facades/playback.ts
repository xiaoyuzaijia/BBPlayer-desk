// PlaybackFacade
// 跨资源编排：trackService + bilibiliApi + audioStreamUrl 缓存策略
//
// 职责：根据 trackId 返回可播放的本地代理 URL（http://127.0.0.1:<port>/stream?url=...）
// - bilibili 源：查 DB 缓存 → 过期则调 bilibiliApi.getAudioStream → 写回 DB → 包装为本地代理 URL
// - local 源：暂不支持（本计划只覆盖 bilibili）
//
// 关键决策：
// - 缓存有效期 2h，安全余量 5min（避免刚好过期才返回）
// - 同一 trackId 并发请求去重（pendingRequests Map）
// - 错误类型用 FacadeError + BilibiliApiError + ServiceError + DatabaseError，IPC 边界再转 Result
import { errAsync, okAsync, ResultAsync } from 'neverthrow'

import { bilibiliApi } from '../api/clients/bilibili/api'
import type { BilibiliAudioStream } from '../api/clients/bilibili/api'
import type { BilibiliVideoDetails } from '../../types/bilibili'
import type { BilibiliApiError } from '../errors/bilibili'
import { DatabaseError, FacadeError, ServiceError } from '../errors'
import { createFacadeError } from '../errors/facade'
import { createValidationError } from '../errors/service'
import type { TrackService } from '../services/trackService'
import { getTrackService } from '../services'
import type { Track } from '../services/types'
import log from '../utils/log'

const logger = log.extend('Facade.Playback')

// 默认音质参数（首版固定值，后续可加 user preference）
const DEFAULT_AUDIO_QUALITY = 30280 // 192kbps
const DEFAULT_ENABLE_DOLBY = false
const DEFAULT_ENABLE_HI_RES = false

// 缓存有效期 2h，安全余量 5min
const STREAM_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2h
const STREAM_CACHE_SAFETY_MS = 5 * 60 * 1000 // 5min

/**
 * PlaybackFacade 可能返回的错误
 * - FacadeError: facade 层业务错误（如视频失效）
 * - BilibiliApiError: B 站 API 调用失败
 * - ServiceError: trackService 校验失败（如 source 不匹配）
 * - DatabaseError: DB 操作失败
 */
export type PlaybackFacadeError =
  | FacadeError
  | BilibiliApiError
  | ServiceError
  | DatabaseError

/**
 * PlaybackFacade
 */
export class PlaybackFacade {
  private readonly trackService: TrackService
  private readonly bilibiliApiInstance: typeof bilibiliApi
  private readonly streamProxyPort: number

  constructor(
    trackService: TrackService,
    bilibiliApiInstance: typeof bilibiliApi,
    streamProxyPort: number,
  ) {
    this.trackService = trackService
    this.bilibiliApiInstance = bilibiliApiInstance
    this.streamProxyPort = streamProxyPort
  }

  /**
   * 获取 track 的可播放 URL（本地代理 URL）
   *
   * 流程：
   * 1. 查 track，校验 source === 'bilibili'
   * 2. videoIsValid=false → 直接返回 err
   * 3. cid 为 null → err（无法解析音频流）
   * 4. 查 bilibiliMetadata.audioStreamUrl + streamExpiresAt
   *    - 非空且未过期（streamExpiresAt > now + 5min）→ 命中缓存，直接包装返回
   *    - 过期或不存在 → 调 refreshAudioUrl
   *
   * 并发去重：同一 trackId 同时只发一个 B 站请求
   */
  getAudioUrl(trackId: number): ResultAsync<string, PlaybackFacadeError> {
    return this.trackService.getTrackById(trackId).andThen((track) => {
      if (track.source !== 'bilibili') {
        return errAsync(
          createValidationError(
            `track ${trackId} 非 bilibili 源，本阶段仅支持 bilibili 播放`,
          ),
        )
      }
      if (!track.bilibiliMetadata.videoIsValid) {
        return errAsync(
          createFacadeError(
            'FetchRemotePlaylistMetadataFailed', // 复用类型，IPC 边界会映射
            `视频 ${track.bilibiliMetadata.bvid} 已失效（被删/审核）`,
            { data: { trackId, bvid: track.bilibiliMetadata.bvid } },
          ),
        )
      }
      // cid 为 null 的处理：
      // - 非 multi_page：调 getVideoDetails 拿首 P cid → 写回 DB → 继续走 refreshAudioUrl
      //   （syncFavorite 批量入库时 cid=null，与 BBPlayer utils/player.ts 行为一致）
      // - multi_page：cid=null 视为数据错误（多 P 视频必须知道播哪一页），返回 err
      if (track.bilibiliMetadata.cid === null) {
        if (track.bilibiliMetadata.isMultiPage) {
          return errAsync(
            createValidationError(
              `track ${trackId} 是多 P 视频但 cid 为 null，无法确定播放哪一页`,
            ),
          )
        }
        return this.fillCidAndRefresh(track)
      }

      // 检查缓存
      const { audioStreamUrl, streamExpiresAt } = track.bilibiliMetadata
      const now = Date.now()
      if (
        audioStreamUrl &&
        streamExpiresAt &&
        streamExpiresAt.getTime() - now > STREAM_CACHE_SAFETY_MS
      ) {
        logger.debug(`track ${trackId} 命中音频流缓存`)
        return okAsync(this.wrapWithProxy(audioStreamUrl))
      }

      // 缓存未命中或已过期，强制刷新
      return this.refreshAudioUrl(track)
    })
  }

  /**
   * cid 缺失时调 getVideoDetails 补 cid 并继续刷新音频流
   * 仅用于非 multi_page 的 bilibili track（multi_page 必须在入库时已带 cid）
   *
   * 流程：
   * 1. bilibiliApi.getVideoDetails({ bvid }) 拿 data.cid（首 P cid）
   * 2. trackService.updateBilibiliCid(trackId, cid) 写回 DB
   * 3. 用补全 cid 后的 track 走 refreshAudioUrl
   */
  private fillCidAndRefresh(
    track: Extract<Track, { source: 'bilibili' }>,
  ): ResultAsync<string, PlaybackFacadeError> {
    const { id: trackId, bilibiliMetadata } = track
    const bvid = bilibiliMetadata.bvid
    logger.info(`track ${trackId} cid 为 null，调 getVideoDetails 补全`, {
      bvid,
    })
    return this.bilibiliApiInstance
      .getVideoDetails({ bvid })
      .andThen((rawData) => {
        const data = rawData as BilibiliVideoDetails
        const cid = data.cid
        if (typeof cid !== 'number' || !Number.isFinite(cid)) {
          return errAsync(
            createValidationError(
              `track ${trackId} 的 bvid ${bvid} 无法从 getVideoDetails 获取有效 cid`,
            ),
          )
        }
        return this.trackService
          .updateBilibiliCid(trackId, cid)
          .map(() => {
            logger.info(`track ${trackId} cid 已补全为 ${cid}`)
            return cid
          })
      })
      .andThen((cid) => {
        // 用补全后的 cid 构造新 track 走 refreshAudioUrl
        const refreshedTrack: Extract<Track, { source: 'bilibili' }> = {
          ...track,
          bilibiliMetadata: { ...bilibiliMetadata, cid },
        }
        return this.refreshAudioUrl(refreshedTrack)
      })
  }

  /**
   * 强制刷新音频流 URL（缓存过期或播放失败时调用）
   * 1. 已知 track（避免重复查询）
   * 2. 调 bilibiliApi.getAudioStream
   * 3. 写回 bilibiliMetadata.audioStreamUrl + streamExpiresAt = getTime + 2h
   * 4. 返回本地代理 URL
   *
   * 并发去重：pendingRequests Map 保证同一 trackId 同时只发一个请求
   */
  refreshAudioUrlByTrackId(
    trackId: number,
  ): ResultAsync<string, PlaybackFacadeError> {
    return this.trackService.getTrackById(trackId).andThen((track) => {
      if (track.source !== 'bilibili') {
        return errAsync(
          createValidationError(
            `track ${trackId} 非 bilibili 源，本阶段仅支持 bilibili 播放`,
          ),
        )
      }
      // 与 getAudioUrl 一致：cid=null 时先补 cid 再 refresh
      if (track.bilibiliMetadata.cid === null) {
        if (track.bilibiliMetadata.isMultiPage) {
          return errAsync(
            createValidationError(
              `track ${trackId} 是多 P 视频但 cid 为 null，无法确定播放哪一页`,
            ),
          )
        }
        return this.fillCidAndRefresh(track)
      }
      return this.refreshAudioUrl(track)
    })
  }

  /**
   * 已知 track 的情况下刷新音频流 URL
   * 内部使用 pendingRequests Map 做并发去重
   */
  private refreshAudioUrl(
    track: Extract<Track, { source: 'bilibili' }>,
  ): ResultAsync<string, PlaybackFacadeError> {
    const { id: trackId, bilibiliMetadata } = track
    const cid = bilibiliMetadata.cid
    if (cid === null) {
      return errAsync(
        createValidationError(
          `track ${trackId} 的 cid 为 null，无法解析音频流`,
        ),
      )
    }

    // 并发去重：如果已有 pending 请求，复用之
    const existing = this.pendingRequests.get(trackId)
    if (existing) {
      logger.debug(`track ${trackId} 已有 pending 请求，复用`)
      return existing
    }

    const pending = this.doRefreshAudioUrl(trackId, bilibiliMetadata.bvid, cid)
      // finally 等价：完成后从 pendingRequests 移除
      .map((url) => {
        this.pendingRequests.delete(trackId)
        return url
      })
      .mapErr((e) => {
        this.pendingRequests.delete(trackId)
        return e
      })
    this.pendingRequests.set(trackId, pending)
    return pending
  }

  /**
   * 实际发起 B 站请求 + 写回 DB 的逻辑
   */
  private doRefreshAudioUrl(
    trackId: number,
    bvid: string,
    cid: number,
  ): ResultAsync<string, PlaybackFacadeError> {
    logger.debug(`track ${trackId} 请求新音频流 URL (bvid=${bvid}, cid=${cid})`)
    return this.bilibiliApiInstance
      .getAudioStream({
        bvid,
        cid,
        audioQuality: DEFAULT_AUDIO_QUALITY,
        enableDolby: DEFAULT_ENABLE_DOLBY,
        enableHiRes: DEFAULT_ENABLE_HI_RES,
      })
      .andThen((stream: BilibiliAudioStream) => {
        // 过期时间 = getTime + 2h
        const streamExpiresAt = new Date(
          stream.getTime + STREAM_CACHE_TTL_MS,
        )
        return this.trackService
          .updateBilibiliAudioStream(trackId, stream.url, streamExpiresAt)
          .map(() => {
            logger.info(
              `track ${trackId} 音频流 URL 已缓存，过期时间 ${streamExpiresAt.toISOString()}`,
            )
            return this.wrapWithProxy(stream.url)
          })
      })
  }

  /**
   * 把 B 站 CDN URL 包装为本地代理 URL
   */
  private wrapWithProxy(cdnUrl: string): string {
    return `http://127.0.0.1:${this.streamProxyPort}/stream?url=${encodeURIComponent(cdnUrl)}`
  }

  /**
   * 同 trackId 并发请求去重 Map
   * value 是 pending 的 ResultAsync，复用同一个 Promise
   */
  private readonly pendingRequests = new Map<
    number,
    ResultAsync<string, PlaybackFacadeError>
  >()
}

// ##################################
// 模块级单例
// ##################################

let facadeInstance: PlaybackFacade | null = null

/**
 * 初始化 PlaybackFacade 单例
 * 必须在 startStreamProxy() 之后调用，因为需要 streamProxyPort
 */
export function initPlaybackFacade(streamProxyPort: number): PlaybackFacade {
  facadeInstance = new PlaybackFacade(
    getTrackService(),
    bilibiliApi,
    streamProxyPort,
  )
  return facadeInstance
}

/**
 * 获取已初始化的 PlaybackFacade 单例
 * 未初始化时抛错
 */
export function getPlaybackFacade(): PlaybackFacade {
  if (!facadeInstance) {
    throw new Error(
      '[PlaybackFacade] 未初始化，请先调用 initPlaybackFacade(streamProxyPort)',
    )
  }
  return facadeInstance
}

// 保留引用以避免 unused 警告
void okAsync
void errAsync
