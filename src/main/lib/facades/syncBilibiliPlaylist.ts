// SyncBilibiliPlaylistFacade（复刻 BBPlayer apps/mobile/src/lib/facades/syncBilibiliPlaylist.ts）
// 跨资源编排：bilibiliApi + trackService + artistService + playlistService + db
// 三种 B 站远端歌单同步：收藏夹 / 合集 / 多 P 视频
//
// 关键差异（与 BBPlayer 对比）：
// - better-sqlite3 事务是同步的，事务回调内不能 await
//   因此事务内调用 service 的 *Sync 变体方法（返回 Result 而非 ResultAsync）
// - 去掉 toast.info（UI 关注，由渲染进程订阅 progress 自行提示）
// - 去掉 analyticsService.logPlaylistSync（本项目无埋点）
// - 错误类型用 FacadeError + BilibiliApiError，IPC 边界再转 Result
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow'

import { bilibiliApi } from '../api/clients/bilibili/api'
import { av2bv, bv2av } from '../api/clients/bilibili/utils'
import type { DBLike } from '../db'
import { getDb } from '../db'
import * as schema from '../db/schema'
import type { BilibiliApiError } from '../errors/bilibili'
import { FacadeError } from '../errors'
import {
  createFacadeError,
  createSyncTaskAlreadyRunningError,
} from '../errors/facade'
import { createValidationError } from '../errors/service'
import type { ArtistService } from '../services/artistService'
import { getArtistService } from '../services'
import { getPlaylistService } from '../services'
import { getTrackService } from '../services'
import type { PlaylistService } from '../services/playlistService'
import type { TrackService } from '../services/trackService'
import generateUniqueTrackKey from '../services/genKey'
import type {
  CreateArtistPayload,
  CreateTrackPayload,
  PlaylistType,
  Track,
} from '../services/types'
import type {
  BilibiliCollectionAllContents,
  BilibiliFavoriteListAllContents,
  BilibiliFavoriteListContent,
  BilibiliFavoriteListContents,
  BilibiliVideoDetails,
} from '../../types/bilibili'
import log from '../utils/log'
import { diffSets } from '../utils/set'

const baseLogger = log.extend('Facade.SyncBilibiliPlaylist')

/**
 * 同步进度回调数据
 * 主进程通过 IPC `playlist:syncProgress` 推送给渲染进程
 */
export interface FavoriteSyncProgress {
  message: string
  current?: number
  total?: number
  stage:
    | 'initializing'
    | 'fetching_metadata'
    | 'calculating_diff'
    | 'fetching_details'
    | 'saving'
    | 'completed'
    | 'error'
  /** 标识本次同步任务（type + remoteSyncId），渲染进程用来匹配正在同步的歌单 */
  taskId: string
}

export type SyncProgressCb = (progress: FavoriteSyncProgress) => void

/**
 * 完整的 drizzle 数据库实例类型（带 .transaction 方法）
 * 与 DBLike 区别：DBLike 包含事务连接（tx），后者没有 .transaction
 */
type FullDb = BetterSQLite3Database<typeof schema>

/**
 * SyncBilibiliPlaylistFacade
 *
 * 同步三种 B 站远端歌单到本地：
 * - favorite: 收藏夹（增量 diff，按 bvid 比对）
 * - collection: 合集（全量替换）
 * - multi_page: 多 P 视频（全量替换，按 page 拆分）
 *
 * syncingIds 防止同一歌单并发同步
 * 事务内调用 service 的 *Sync 方法保证原子性
 */
export class SyncBilibiliPlaylistFacade {
  private syncingIds = new Set<string>()
  private readonly trackService: TrackService
  private readonly bilibiliApiInstance: typeof bilibiliApi
  private readonly playlistService: PlaylistService
  private readonly artistService: ArtistService
  private readonly db: FullDb

  constructor(
    trackService: TrackService,
    bilibiliApiInstance: typeof bilibiliApi,
    playlistService: PlaylistService,
    artistService: ArtistService,
    db: FullDb,
  ) {
    this.trackService = trackService
    this.bilibiliApiInstance = bilibiliApiInstance
    this.playlistService = playlistService
    this.artistService = artistService
    this.db = db
  }

  /**
   * 从 Bilibili API 获取视频信息，并创建一个新的音轨（单 P）
   * 不在事务内，直接调 service 异步方法
   */
  public addTrackFromBilibiliApi(
    bvid: string,
    cid?: number,
  ): ResultAsync<Track, BilibiliApiError | FacadeError> {
    const logger = baseLogger.extend('addTrackFromBilibiliApi')
    logger.info('开始添加 Track（Bilibili）', { bvid, cid })

    return this.bilibiliApiInstance
      .getVideoDetails({ bvid })
      .andThen((rawData) => {
        const data = rawData as BilibiliVideoDetails
        // 先 findOrCreate artist，再 findOrCreate track
        return this.artistService
          .findOrCreateArtist({
            name: data.owner.name,
            source: 'bilibili',
            remoteId: String(data.owner.mid),
            avatarUrl: data.owner.face,
          })
          .andThen((artist) =>
            this.trackService.findOrCreateTrack({
              title: data.title,
              source: 'bilibili',
              bilibiliMetadata: {
                bvid,
                cid: cid ?? null,
                isMultiPage: cid !== undefined,
                videoIsValid: true,
              },
              coverUrl: data.pic,
              duration: data.duration,
              artistId: artist.id,
            }),
          )
      })
      .map((track) => {
        logger.info('添加 Track 成功', {
          trackId: track.id,
          title: track.title,
          source: track.source,
        })
        return track
      })
  }

  /**
   * 将单一 track 录入到本地数据库
   * 用于把外部 Track 对象（如来自搜索结果）写入本地
   */
  public addTrackToLocal(
    track: Track,
  ): ResultAsync<Track, FacadeError | BilibiliApiError> {
    if (!track.artist) {
      return errAsync(createValidationError('artist 不存在'))
    }
    return this.artistService
      .findOrCreateArtist({
        name: track.artist.name,
        source: track.artist.source,
        remoteId: track.artist.remoteId ?? undefined,
        avatarUrl: track.artist.avatarUrl,
        signature: track.artist.signature,
      })
      .andThen((artist) =>
        this.trackService.findOrCreateTrack({
          ...(track as unknown as CreateTrackPayload),
          artistId: artist.id,
        }),
      )
  }

  /**
   * 同步合集内容
   * 全量替换：拉取所有 medias，一次性写入本地
   * @param collectionId 合集 id（season_id）
   * @returns playlistId
   */
  public syncCollection(
    collectionId: number,
  ): ResultAsync<number, BilibiliApiError | FacadeError> {
    const logger = baseLogger.extend(`syncCollection:${collectionId}`)
    const taskId = `collection::${collectionId}`

    if (this.syncingIds.has(taskId)) {
      logger.info('已有同步任务在进行，跳过', { collectionId })
      return errAsync(createSyncTaskAlreadyRunningError())
    }
    this.syncingIds.add(taskId)

    return this.bilibiliApiInstance
      .getCollectionAllContents({ collectionId })
      .andThen((rawContents) => {
        const contents = rawContents as BilibiliCollectionAllContents
        logger.info('获取合集详情成功', {
          title: contents.info.title,
          total: contents.medias?.length ?? 0,
        })

        const medias = contents.medias ?? []
        if (medias.length === 0) {
          return errAsync(
            createFacadeError(
              'SyncCollectionFailed',
              '同步合集失败，该合集中没有任何 track',
            ),
          )
        }

        // 进入事务，调用 service 的 *Sync 变体
        const txResult = this.runTransaction((tx) => {
          const playlistSvc = this.playlistService.withDB(tx)
          const trackSvc = this.trackService.withDB(tx)
          const artistSvc = this.artistService.withDB(tx)

          // 1. 创建 playlist 的作者 artist
          const playlistArtist = artistSvc.findOrCreateArtistSync({
            name: contents.info.upper.name,
            source: 'bilibili',
            remoteId: String(contents.info.upper.mid),
          })
          if (playlistArtist.isErr()) throw playlistArtist.error

          // 2. findOrCreate playlist
          const playlistRes = playlistSvc.findOrCreateRemotePlaylistSync({
            title: contents.info.title,
            description: contents.info.intro,
            coverUrl: contents.info.cover,
            type: 'collection',
            remoteSyncId: collectionId,
            authorId: playlistArtist.value.id,
          })
          if (playlistRes.isErr()) throw playlistRes.error
          logger.debug('step 2: 创建 playlist 和其对应的 artist 信息完成', {
            id: playlistRes.value.id,
          })

          // 3. 收集去重的 artist
          const uniqueArtists = new Map<number, { name: string }>()
          for (const media of medias) {
            if (!uniqueArtists.has(media.upper.mid)) {
              uniqueArtists.set(media.upper.mid, { name: media.upper.name })
            }
          }

          const artistPayloads: CreateArtistPayload[] = Array.from(
            uniqueArtists,
          ).map(([remoteId, info]) => ({
            name: info.name,
            source: 'bilibili',
            remoteId: String(remoteId),
          }))

          const artistRes =
            artistSvc.findOrCreateManyRemoteArtistsSync(artistPayloads)
          if (artistRes.isErr()) throw artistRes.error
          const localArtistIdMap = artistRes.value
          logger.debug('step 3: 创建 artist 完成', {
            uniqueCount: uniqueArtists.size,
          })

          // 4. 批量 findOrCreate tracks
          const trackPayloads: CreateTrackPayload[] = medias.map((v) => ({
            title: v.title,
            source: 'bilibili',
            bilibiliMetadata: {
              bvid: v.bvid,
              isMultiPage: false,
              cid: null,
              videoIsValid: true,
            },
            coverUrl: v.cover,
            duration: v.duration,
            artistId: localArtistIdMap.get(String(v.upper.mid))?.id,
          }))

          const tracksCreateResult =
            trackSvc.findOrCreateManyTracksSync(trackPayloads, 'bilibili')
          if (tracksCreateResult.isErr()) throw tracksCreateResult.error
          const trackIds = Array.from(tracksCreateResult.value.values())
          logger.debug('step 4: 创建 tracks 完成', { total: trackIds.length })

          // 5. 全量替换 playlist 内容（同时更新 itemCount/lastSyncedAt）
          const replaceResult = playlistSvc.replacePlaylistAllTracksSync(
            playlistRes.value.id,
            trackIds,
          )
          if (replaceResult.isErr()) throw replaceResult.error
          logger.debug('step 5: 替换 playlist 中所有 tracks 完成')
          logger.info('同步合集完成', {
            remoteId: contents.info.id,
            playlistId: playlistRes.value.id,
          })

          return playlistRes.value.id
        })

        return txResult.mapErr((e) =>
          e instanceof FacadeError
            ? e
            : createFacadeError('SyncCollectionFailed', '同步合集失败', {
                cause: e,
              }),
        )
      })
      .map((playlistId) => {
        this.syncingIds.delete(taskId)
        return playlistId
      })
      .mapErr((e) => {
        this.syncingIds.delete(taskId)
        return e
      })
  }

  /**
   * 同步多集视频
   * 一个 BV 号下多个 page → 每页一个 track
   * @param bvid 多 P 视频的 bvid
   * @returns playlistId
   */
  public syncMultiPageVideo(
    bvid: string,
  ): ResultAsync<number, BilibiliApiError | FacadeError> {
    const logger = baseLogger.extend(`syncMultiPage:${bvid}`)
    const taskId = `multiPage::${bvid}`

    if (this.syncingIds.has(taskId)) {
      logger.info('已有同步任务在进行，跳过', { bvid })
      return errAsync(createSyncTaskAlreadyRunningError())
    }
    this.syncingIds.add(taskId)

    return this.bilibiliApiInstance
      .getVideoDetails({ bvid })
      .andThen((rawData) => {
        const data = rawData as BilibiliVideoDetails
        logger.info('获取多集视频详情成功', {
          title: data.title,
          pages: data.pages.length,
        })

        const txResult = this.runTransaction((tx) => {
          const playlistSvc = this.playlistService.withDB(tx)
          const trackSvc = this.trackService.withDB(tx)
          const artistSvc = this.artistService.withDB(tx)

          // 1. playlist 作者 = 视频上传者
          const playlistAuthor = artistSvc.findOrCreateArtistSync({
            name: data.owner.name,
            source: 'bilibili',
            remoteId: String(data.owner.mid),
            avatarUrl: data.owner.face,
          })
          if (playlistAuthor.isErr()) throw playlistAuthor.error

          // 2. findOrCreate playlist（remoteSyncId 用 avid）
          const playlistRes = playlistSvc.findOrCreateRemotePlaylistSync({
            title: data.title,
            description: data.desc,
            coverUrl: data.pic,
            type: 'multi_page',
            remoteSyncId: bv2av(bvid),
            authorId: playlistAuthor.value.id,
          })
          if (playlistRes.isErr()) throw playlistRes.error
          logger.debug('step 2: 创建 playlist 完成', {
            id: playlistRes.value.id,
          })

          // 3. 每个 page 一个 track
          const trackPayloads: CreateTrackPayload[] = data.pages.map(
            (page) => ({
              title: page.part,
              source: 'bilibili',
              bilibiliMetadata: {
                bvid,
                isMultiPage: true,
                cid: page.cid,
                videoIsValid: true,
                mainTrackTitle: data.title,
              },
              coverUrl: data.pic,
              duration: page.duration,
              artistId: playlistAuthor.value.id,
            }),
          )

          const trackCreateResult = trackSvc.findOrCreateManyTracksSync(
            trackPayloads,
            'bilibili',
          )
          if (trackCreateResult.isErr()) throw trackCreateResult.error
          const trackIds = Array.from(trackCreateResult.value.values())
          logger.debug('step 3: 创建 tracks 完成', { total: trackIds.length })

          // 4. 全量替换
          const replaceResult = playlistSvc.replacePlaylistAllTracksSync(
            playlistRes.value.id,
            trackIds,
          )
          if (replaceResult.isErr()) throw replaceResult.error
          logger.debug('step 4: 替换 playlist 中所有 tracks 完成')
          logger.info('同步多 P 视频完成', {
            remoteId: bv2av(bvid),
            playlistId: playlistRes.value.id,
          })

          return playlistRes.value.id
        })

        return txResult.mapErr((e) =>
          e instanceof FacadeError
            ? e
            : createFacadeError('SyncMultiPageFailed', '同步多集视频失败', {
                cause: e,
              }),
        )
      })
      .map((playlistId) => {
        this.syncingIds.delete(taskId)
        return playlistId
      })
      .mapErr((e) => {
        this.syncingIds.delete(taskId)
        return e
      })
  }

  /**
   * 同步收藏夹内容
   * 增量 diff：比对远端 bvid 集合 vs 本地 bilibiliMetadata.bvid，仅拉取新增部分详情
   *
   * @param favoriteId 收藏夹 ID
   * @param onProgress 同步进度回调
   * @returns Result 成功时为 playlist ID，undefined 表示远端收藏夹为空，且本地之前也没有创建过
   *          （这种情况前端不应该显示同步按钮）
   */
  public async syncFavorite(
    favoriteId: number,
    onProgress?: SyncProgressCb,
  ): Promise<Result<number | undefined, FacadeError | BilibiliApiError>> {
    const logger = baseLogger.extend(`syncFavorite:${favoriteId}`)
    const taskId = `favorite::${favoriteId}`

    // getFavoriteListAllContents 获取到的 bvid 中会包含被 up 隐藏的视频，但这部分视频在
    // getFavoriteListContents 中是找不到的，也就无法添加到本地数据库。这导致对于包含这种
    // 视频的收藏夹，每次同步都会重新「同步」这些视频，但咱们没办法......
    if (this.syncingIds.has(taskId)) {
      return err(createSyncTaskAlreadyRunningError())
    }
    this.syncingIds.add(taskId)

    try {
      onProgress?.({
        message: '初始化同步任务...',
        stage: 'initializing',
        taskId,
      })
      logger.info('开始同步收藏夹', { favoriteId })

      // 从 bilibili 获取基本元数据和收藏夹所有 bvid
      onProgress?.({
        message: '正在获取收藏夹元数据...',
        stage: 'fetching_metadata',
        taskId,
      })

      const bilibiliResult = await ResultAsync.combine([
        this.bilibiliApiInstance.getFavoriteListAllContents({ favoriteId }),
        this.bilibiliApiInstance.getFavoriteListContents({
          favoriteId,
          pn: 1,
        }),
      ])
      if (bilibiliResult.isErr()) {
        return err(bilibiliResult.error)
      }

      const bilibiliFavoriteListAllContents =
        bilibiliResult.value[0] as BilibiliFavoriteListAllContents
      const bilibiliFavoriteListMetadata =
        bilibiliResult.value[1] as unknown as BilibiliFavoriteListContents

      const favoriteListInfo = bilibiliFavoriteListMetadata.info
      if (!favoriteListInfo) {
        return err(
          createFacadeError(
            'SyncFavoriteFailed',
            '同步收藏夹失败，数据为空，收藏夹可能不存在',
          ),
        )
      }

      logger.debug('step 1: 调用 bilibiliapi getFavoriteListAllContents 完成', {
        total: bilibiliFavoriteListAllContents.length,
      })

      // 查询本地收藏夹元数据
      const localPlaylist = await this.playlistService
        .findPlaylistByTypeAndRemoteId('favorite', favoriteId)
      if (localPlaylist.isErr()) {
        return err(localPlaylist.error)
      }
      logger.debug('step 2: 查询本地收藏夹元数据完成', {
        localPlaylistId: localPlaylist.value?.id ?? '不存在',
      })

      // 开始计算 diff
      onProgress?.({
        message: '正在比对本地数据...',
        stage: 'calculating_diff',
        taskId,
      })

      // 保存全部 bvid 集合（后续剔除被隐藏的视频后用于全量重排）
      const afterRemovedHiddenBvidsAllBvids = new Set<string>(
        bilibiliFavoriteListAllContents.map((item) => item.bvid),
      )

      let bvidsToAddSet: Set<string>
      let bvidsToRemoveSet: Set<string>
      if (!localPlaylist.value || localPlaylist.value.itemCount === 0) {
        // 本地收藏夹为空或没创建过，全部添加
        bvidsToAddSet = new Set(
          bilibiliFavoriteListAllContents.map((item) => item.bvid),
        )
        bvidsToRemoveSet = new Set()
      } else {
        const existTracks = await this.playlistService.getPlaylistTracks(
          localPlaylist.value.id,
        )
        if (existTracks.isErr()) {
          return err(existTracks.error)
        }
        // 类型校验：本地收藏夹内只允许 bilibili 源 track
        if (existTracks.value.find((item) => item.source !== 'bilibili')) {
          return err(
            createFacadeError(
              'SyncFavoriteFailed',
              '同步收藏夹失败，收藏夹中存在非 Bilibili 的 Track，数据库不一致',
            ),
          )
        }
        // diff 计算：注意 added/removed 是反向的
        // diffSets(source=remote, target=local)
        //   added = local 中存在但 remote 中没有的（应删除）
        //   removed = remote 中存在但 local 中没有的（应添加）
        const biliTracks = existTracks.value as Extract<
          Track,
          { source: 'bilibili' }
        >[]
        const diff = diffSets(
          new Set(bilibiliFavoriteListAllContents.map((item) => item.bvid)),
          new Set(biliTracks.map((item) => item.bilibiliMetadata.bvid)),
        )
        bvidsToAddSet = diff.removed
        bvidsToRemoveSet = diff.added
      }

      logger.debug('step 3: 对远程和本地的 tracks 进行 diff 完成', {
        added: bvidsToAddSet.size,
        removed: bvidsToRemoveSet.size,
      })
      logger.info('收藏夹变更统计', {
        added: bvidsToAddSet.size,
        removed: bvidsToRemoveSet.size,
      })

      if (bvidsToAddSet.size === 0 && bvidsToRemoveSet.size === 0) {
        logger.info('收藏夹为空或与上次相比无变化，无需同步')
        onProgress?.({
          message: '收藏夹无变化',
          stage: 'completed',
          taskId,
        })
        return ok(localPlaylist.value?.id)
      }

      // 开始获取收藏夹新增部分 bvid 的详细元数据
      // 从第一页（最新）开始获取，直到所有新增的 bvid 都获取完成
      onProgress?.({
        message: `准备同步 ${bvidsToAddSet.size} 个新视频...`,
        current: 0,
        total: bvidsToAddSet.size,
        stage: 'fetching_details',
        taskId,
      })

      const addedTracksMetadata = new Set<BilibiliFavoriteListContent>()
      let nowPageNumber = 0
      let hasMore = true
      const totalToAdd = bvidsToAddSet.size
      let fetchedCount = 0

      while (hasMore) {
        if (bvidsToAddSet.size === 0) break
        nowPageNumber += 1
        onProgress?.({
          message: `正在获取第 ${nowPageNumber} 页详情...`,
          current: fetchedCount,
          total: totalToAdd,
          stage: 'fetching_details',
          taskId,
        })
        logger.debug(`开始获取第 ${nowPageNumber} 页收藏夹内容`)

        // 注意：循环内 await 是有意为之，分页串行拉取避免触发 B 站风控
        const pageResult = await this.bilibiliApiInstance.getFavoriteListContents(
          { favoriteId, pn: nowPageNumber },
        )
        if (pageResult.isErr()) {
          return err(pageResult.error)
        }
        const page = pageResult.value as unknown as BilibiliFavoriteListContents
        if (!page.medias) {
          return err(
            createFacadeError(
              'SyncFavoriteFailed',
              '同步收藏夹失败，该收藏夹中没有任何 track',
            ),
          )
        }
        hasMore = page.has_more
        for (const item of page.medias) {
          if (bvidsToAddSet.has(item.bvid)) {
            addedTracksMetadata.add(item)
            bvidsToAddSet.delete(item.bvid)
            fetchedCount++
          }
        }
        onProgress?.({
          message: `已获取 ${fetchedCount}/${totalToAdd} 个视频详情...`,
          current: fetchedCount,
          total: totalToAdd,
          stage: 'fetching_details',
          taskId,
        })
      }

      if (bvidsToAddSet.size > 0) {
        // B 站隐藏了被 up 设置为仅自己可见的稿件，却没有更新索引
        // 同步到的歌曲数量会少于收藏夹实际显示的数量
        const tip = `Bilibili 隐藏了被 up 设置为仅自己可见的稿件，却没有更新索引，所以你会看到同步到的歌曲数量少于收藏夹实际显示的数量，具体隐藏稿件：${[...bvidsToAddSet].join(',')}`
        logger.warning(tip)
        // 在清洗集中删除隐藏的视频
        for (const bvid of bvidsToAddSet) {
          afterRemovedHiddenBvidsAllBvids.delete(bvid)
        }
      }
      logger.debug('step 4: 获取要添加的 tracks 元数据完成', {
        added: addedTracksMetadata.size,
        requestApiTimes: nowPageNumber,
      })

      onProgress?.({
        message: '正在保存数据到数据库...',
        stage: 'saving',
        taskId,
      })

      // 进入事务，调用 service *Sync 变体
      const txResult = this.runTransaction((tx) => {
        const playlistSvc = this.playlistService.withDB(tx)
        const trackSvc = this.trackService.withDB(tx)
        const artistSvc = this.artistService.withDB(tx)

        // 1. 创建 playlist 的作者 artist
        // favoriteListInfo 已在事务外校验过非空
        const info = favoriteListInfo
        const playlistAuthor = artistSvc.findOrCreateArtistSync({
          name: info.upper.name,
          source: 'bilibili',
          remoteId: String(info.upper.mid),
          avatarUrl: info.upper.face,
        })
        if (playlistAuthor.isErr()) throw playlistAuthor.error

        // 2. findOrCreate playlist
        const localPlaylistRes = playlistSvc.findOrCreateRemotePlaylistSync({
          title: info.title,
          description: info.intro,
          coverUrl: info.cover,
          type: 'favorite',
          remoteSyncId: favoriteId,
          authorId: playlistAuthor.value.id,
        })
        if (localPlaylistRes.isErr()) throw localPlaylistRes.error
        logger.debug('step 5: 创建 playlist 和其对应的 author 信息完成', {
          localPlaylistId: localPlaylistRes.value.id,
          artistId: playlistAuthor.value.id,
        })

        // 3. 收集去重的 artist
        const uniqueArtistPayloadsMap = new Map<string, CreateArtistPayload>()
        for (const trackMeta of addedTracksMetadata) {
          const remoteId = String(trackMeta.upper.mid)
          if (!uniqueArtistPayloadsMap.has(remoteId)) {
            uniqueArtistPayloadsMap.set(remoteId, {
              name: trackMeta.upper.name,
              source: 'bilibili',
              remoteId,
              avatarUrl: trackMeta.upper.face,
            })
          }
        }
        const uniqueArtistPayloads = Array.from(uniqueArtistPayloadsMap.values())
        const artistsMap =
          artistSvc.findOrCreateManyRemoteArtistsSync(uniqueArtistPayloads)
        if (artistsMap.isErr()) throw artistsMap.error
        logger.debug('step 6: 创建 artist 完成', {
          total: artistsMap.value.size,
        })

        // 4. 批量 findOrCreate 新增的 tracks
        const addedTrackPayloads: CreateTrackPayload[] = Array.from(
          addedTracksMetadata,
        ).map((v) => ({
          title: v.title,
          source: 'bilibili',
          bilibiliMetadata: {
            bvid: v.bvid,
            isMultiPage: false,
            cid: null,
            // attr === 0 表示视频正常，其他值表示失效
            videoIsValid: v.attr === 0,
          },
          coverUrl: v.cover,
          duration: v.duration,
          artistId: artistsMap.value.get(String(v.upper.mid))?.id,
        }))

        const createdTracksMapResult = trackSvc.findOrCreateManyTracksSync(
          addedTrackPayloads,
          'bilibili',
        )
        if (createdTracksMapResult.isErr()) {
          throw createdTracksMapResult.error
        }
        logger.debug(
          'step 7: 创建或查找 tracks 并获取 uniqueKey->id 映射完成',
          { total: createdTracksMapResult.value.size },
        )

        // 5. 为远端所有 bvid 生成 uniqueKey 顺序列表（用于排序）
        const orderedUniqueKeysResult = Result.combine(
          Array.from(afterRemovedHiddenBvidsAllBvids).map((bvid) =>
            generateUniqueTrackKey({
              source: 'bilibili',
              bilibiliMetadata: {
                bvid,
                isMultiPage: false,
                videoIsValid: true,
              },
            }),
          ),
        )
        if (orderedUniqueKeysResult.isErr()) {
          throw orderedUniqueKeysResult.error
        }
        const orderedUniqueKeys = orderedUniqueKeysResult.value
        logger.debug(
          'step 8: 为远程所有 tracks 生成了其对应的 uniqueKey 顺序列表',
          { total: orderedUniqueKeys.length },
        )

        // 6. 一次性获取所有 uniqueKey 到本地 ID 的映射
        const uniqueKeyToIdMapResult = trackSvc.findTrackIdsByUniqueKeysSync(
          orderedUniqueKeys,
        )
        if (uniqueKeyToIdMapResult.isErr()) {
          throw uniqueKeyToIdMapResult.error
        }
        const uniqueKeyToIdMap = uniqueKeyToIdMapResult.value
        logger.debug('step 9: 一次性获取所有 uniqueKey 到本地 ID 的映射完成', {
          total: uniqueKeyToIdMap.size,
        })

        // 7. 按 B 站收藏夹顺序重排所有 trackId
        const finalOrderedTrackIds = orderedUniqueKeys.map((key) => {
          const id = uniqueKeyToIdMap.get(key)
          if (id === undefined) {
            throw createFacadeError(
              'SyncFavoriteFailed',
              '已完成 tracks 创建后，却依然没有找到 uniqueKey 对应的 ID',
            )
          }
          return id
        })
        logger.debug('step 10: 按 Bilibili 收藏夹顺序重排所有 tracks 完成', {
          total: finalOrderedTrackIds.length,
        })

        // 8. 全量替换 playlist 内容
        const replaceResult = playlistSvc.replacePlaylistAllTracksSync(
          localPlaylistRes.value.id,
          finalOrderedTrackIds,
        )
        if (replaceResult.isErr()) throw replaceResult.error
        logger.debug('step 11: 替换 playlist 中所有 tracks 完成')
        logger.info('同步收藏夹完成', {
          remoteId: favoriteId,
          playlistId: localPlaylistRes.value.id,
        })

        return localPlaylistRes.value.id
      })

      if (txResult.isErr()) {
        const facadeError =
          txResult.error instanceof FacadeError
            ? txResult.error
            : createFacadeError('SyncFavoriteFailed', '同步收藏夹失败', {
                cause: txResult.error,
              })
        onProgress?.({
          message: facadeError.message,
          stage: 'error',
          taskId,
        })
        return err(facadeError)
      }

      onProgress?.({
        message: '同步完成',
        stage: 'completed',
        taskId,
      })
      return ok(txResult.value)
    } finally {
      this.syncingIds.delete(taskId)
    }
  }

  /**
   * 根据传入的同步 ID 和类型同步播放列表
   * @param remoteSyncId 远程同步 ID（favorite/collection 是收藏夹/合集 id，multi_page 是 avid）
   * @param type 播放列表类型
   * @param onProgress 同步进度回调（仅 favorite 类型支持）
   */
  public sync(
    remoteSyncId: number,
    type: PlaylistType,
    onProgress?: SyncProgressCb,
  ): ResultAsync<number | undefined, FacadeError | BilibiliApiError> {
    switch (type) {
      case 'favorite':
        return ResultAsync.fromSafePromise(
          this.syncFavorite(remoteSyncId, onProgress),
        ).andThen((r) => r)
      case 'collection':
        return this.syncCollection(remoteSyncId)
      case 'multi_page':
        return this.syncMultiPageVideo(av2bv(remoteSyncId))
      case 'local':
        return okAsync(undefined)
    }
  }

  /**
   * 包裹同步事务的辅助方法
   * better-sqlite3 的事务是同步的，回调返回值会作为事务结果
   * 内部捕获异常并转 Result，便于上层链式处理
   *
   * 注意：回调内抛出的任何异常都会回滚事务
   * service 的 *Sync 方法返回 Result，遇到 err 时主动 throw 即可触发回滚
   */
  private runTransaction<T>(
    fn: (tx: DBLike) => T,
  ): Result<T, Error> {
    try {
      const result = this.db.transaction((tx) => fn(tx))
      return ok(result)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
  }
}

/**
 * 模块级单例
 * 延迟初始化：services 必须在 initDb() 之后调用
 */
let facadeInstance: SyncBilibiliPlaylistFacade | null = null

export function getSyncBilibiliPlaylistFacade(): SyncBilibiliPlaylistFacade {
  if (!facadeInstance) {
    facadeInstance = new SyncBilibiliPlaylistFacade(
      getTrackService(),
      bilibiliApi,
      getPlaylistService(),
      getArtistService(),
      getDb(),
    )
  }
  return facadeInstance
}

/**
 * 兼容模块级访问：通过 getter 延迟初始化
 * 模块加载时 services 可能还未初始化，所以不能直接 export 实例
 */
export const syncBilibiliPlaylistFacade = {
  get instance(): SyncBilibiliPlaylistFacade {
    return getSyncBilibiliPlaylistFacade()
  },
}

// 保留 ok/okAsync/err/errAsync 引用以备未来扩展
void ok
void okAsync
void err
void errAsync
