// TrackService（复刻 BBPlayer apps/mobile/src/lib/services/trackService.ts）
// 单表 CRUD：tracks 表 + bilibiliMetadata / localMetadata 分表
// uniqueKey 全局去重；findOrCreateManyTracks 供 sync 批量预查
// 去掉 Sentry / getPlayCountHistoryPaginated / getTotalPlaybackDuration /
// getMostPlayedTracksInLastDays（这些走 historyService 或后续阶段补齐）
//
// 重要：better-sqlite3 事务是同步的，事务回调内不能 await
// 因此提供 *Sync 变体方法（返回 Result 而非 ResultAsync），供 facade 在事务内调用
import { and, eq, inArray } from 'drizzle-orm'
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow'

import type { DBLike } from '../db'
import * as schema from '../db/schema'
import { ServiceError } from '../errors'
import {
  DatabaseError,
  createNotImplementedError,
  createTrackNotFound,
  createValidationError,
} from '../errors/service'
import generateUniqueTrackKey from './genKey'
import type {
  BilibiliMetadataPayload,
  BilibiliTrack,
  CreateBilibiliTrackPayload,
  CreateTrackPayload,
  CreateTrackPayloadBase,
  PlayRecord,
  Track,
  UpdateTrackPayload,
  UpdateTrackPayloadBase,
} from './types'

type SelectTrackBase = typeof schema.tracks.$inferSelect
type SelectTrackWithMetadata = SelectTrackBase & {
  artist: typeof schema.artists.$inferSelect | null
  bilibiliMetadata: typeof schema.bilibiliMetadata.$inferSelect | null
  localMetadata: typeof schema.localMetadata.$inferSelect | null
}

export class TrackService {
  private readonly db: DBLike

  constructor(db: DBLike) {
    this.db = db
  }

  /**
   * 返回一个使用新数据库连接（例如事务）的新实例
   */
  public withDB(conn: DBLike): TrackService {
    return new TrackService(conn)
  }

  /**
   * 把 DB row 转成共享 Track 类型
   * source 与 metadata 不匹配时返回 null（数据一致性问题）
   * 注意：DB 中 duration 可为 null（未拉取到时），转换时降级为 0
   */
  public formatTrack(
    dbTrack: SelectTrackWithMetadata | undefined | null,
  ): Track | null {
    if (!dbTrack) return null

    const baseTrack = {
      id: dbTrack.id,
      uniqueKey: dbTrack.uniqueKey,
      title: dbTrack.title,
      artist: dbTrack.artist,
      coverUrl: dbTrack.coverUrl,
      // duration 列允许 null，类型层降级为 0（与 BBPlayer 类型一致）
      duration: dbTrack.duration ?? 0,
      createdAt: dbTrack.createdAt,
      source: dbTrack.source,
      updatedAt: dbTrack.updatedAt,
    }

    if (dbTrack.source === 'bilibili' && dbTrack.bilibiliMetadata) {
      const bilibiliMeta = dbTrack.bilibiliMetadata
      const bilibiliTrack: BilibiliTrack = {
        ...baseTrack,
        source: 'bilibili',
        bilibiliMetadata: {
          bvid: bilibiliMeta.bvid,
          cid: bilibiliMeta.cid,
          isMultiPage: bilibiliMeta.isMultiPage,
          videoIsValid: bilibiliMeta.videoIsValid,
          mainTrackTitle: bilibiliMeta.mainTrackTitle,
          audioStreamUrl: bilibiliMeta.audioStreamUrl,
          streamExpiresAt: bilibiliMeta.streamExpiresAt,
        },
      }
      return bilibiliTrack
    }

    if (dbTrack.source === 'local' && dbTrack.localMetadata) {
      return {
        ...baseTrack,
        source: 'local',
        localMetadata: {
          localPath: dbTrack.localMetadata.localPath,
        },
      }
    }

    console.warn(
      `[TrackService] track ${dbTrack.id} 存在不一致的 source 和 metadata`,
    )
    return null
  }

  /**
   * 创建一个新的 track（含分表元数据）
   * 内部校验 source 与 metadata 匹配
   */
  private _createTrack(
    payload: CreateTrackPayload,
  ): ResultAsync<Track, ServiceError | DatabaseError> {
    if (payload.source === 'bilibili' && !payload.bilibiliMetadata) {
      return errAsync(
        createValidationError(
          '当 source 为 bilibili 时，bilibiliMetadata 不能为空',
        ),
      )
    }
    if (payload.source === 'local' && !payload.localMetadata) {
      return errAsync(
        createValidationError(
          '当 source 为 local 时，localMetadata 不能为空',
        ),
      )
    }

    const uniqueKey = generateUniqueTrackKey(payload)
    if (uniqueKey.isErr()) {
      return errAsync(uniqueKey.error)
    }

    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          // 创建 track 主表
          const [newTrack] = this.db
            .insert(schema.tracks)
            .values({
              title: payload.title,
              source: payload.source,
              artistId: payload.artistId,
              coverUrl: payload.coverUrl,
              duration: payload.duration,
              uniqueKey: uniqueKey.value,
            })
            .returning({ id: schema.tracks.id })
            .all()

          const trackId = newTrack.id

          // 创建分表元数据
          if (payload.source === 'bilibili') {
            this.db
              .insert(schema.bilibiliMetadata)
              .values({
                trackId,
                bvid: payload.bilibiliMetadata.bvid,
                cid: payload.bilibiliMetadata.cid,
                isMultiPage: payload.bilibiliMetadata.isMultiPage,
                mainTrackTitle: payload.bilibiliMetadata.mainTrackTitle,
                videoIsValid: payload.bilibiliMetadata.videoIsValid,
              })
              .run()
          } else if (payload.source === 'local') {
            this.db
              .insert(schema.localMetadata)
              .values({
                trackId,
                localPath: payload.localMetadata.localPath,
              })
              .run()
          }

          return trackId
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('创建 track 失败', { cause: e }),
    ).andThen((newTrackId) => this.getTrackById(newTrackId))
  }

  /**
   * 更新一个现有的 track
   */
  public updateTrack(
    payload: UpdateTrackPayload,
  ): ResultAsync<Track, ServiceError | DatabaseError> {
    const { id, ...dataToUpdate } = payload

    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db
          .update(schema.tracks)
          .set({
            title: dataToUpdate.title ?? undefined,
            artistId: dataToUpdate.artistId,
            coverUrl: dataToUpdate.coverUrl,
            duration: dataToUpdate.duration,
          } satisfies Omit<UpdateTrackPayloadBase, 'id'>)
          .where(eq(schema.tracks.id, id))
          .run(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError(`更新 track 失败：${id}`, { cause: e }),
    ).andThen(() => this.getTrackById(id))
  }

  /**
   * 通过 ID 获取单个 track 的完整信息（含 artist / metadata）
   */
  public getTrackById(
    id: number,
  ): ResultAsync<Track, ServiceError | DatabaseError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.tracks
          .findFirst({
            where: eq(schema.tracks.id, id),
            with: {
              artist: true,
              bilibiliMetadata: true,
              localMetadata: true,
            },
          })
          .sync(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError(`查找 track 失败：${id}`, { cause: e }),
    ).andThen((dbTrack) => {
      const result = this.formatTrack(dbTrack)
      if (!result) return errAsync(createTrackNotFound(id))
      return okAsync(result)
    })
  }

  /**
   * 删除一个 track（级联删除 metadata / playlistTracks / playHistory）
   */
  public deleteTrack(
    id: number,
  ): ResultAsync<{ deletedId: number }, ServiceError | DatabaseError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db
          .delete(schema.tracks)
          .where(eq(schema.tracks.id, id))
          .returning({ deletedId: schema.tracks.id })
          .all(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError(`删除 track 失败：${id}`, { cause: e }),
    ).andThen((results) => {
      const result = results[0]
      if (!result) return errAsync(createTrackNotFound(id))
      return okAsync(result)
    })
  }

  /**
   * 为 track 增加一次播放记录
   */
  public addPlayRecordFromTrackId(
    trackId: number,
    record: PlayRecord,
  ): ResultAsync<true, ServiceError | DatabaseError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db
          .insert(schema.playHistory)
          .values({
            trackId,
            startTime: record.startTime,
            durationPlayed: record.durationPlayed,
            completed: record.completed,
          })
          .returning({ id: schema.playHistory.id })
          .run(),
      ),
      (e) =>
        new DatabaseError(`增加播放记录失败：${trackId}`, { cause: e }),
    ).andThen(() => okAsync(true as const))
  }

  /**
   * 更新 bilibiliMetadata 的音频流 URL 缓存
   * PlaybackFacade 在拉取新音频流 URL 后调用，写回 audioStreamUrl + streamExpiresAt
   * 仅 bilibili 源 track 有效，其他源返回 Validation 错误
   */
  public updateBilibiliAudioStream(
    trackId: number,
    audioStreamUrl: string,
    streamExpiresAt: Date,
  ): ResultAsync<true, ServiceError | DatabaseError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db
          .update(schema.bilibiliMetadata)
          .set({
            audioStreamUrl,
            streamExpiresAt,
          })
          .where(eq(schema.bilibiliMetadata.trackId, trackId))
          .run(),
      ),
      (e) =>
        new DatabaseError(`更新音频流 URL 缓存失败：trackId=${trackId}`, {
          cause: e,
        }),
    ).andThen((result) => {
      if (result.changes === 0) {
        return errAsync(
          createValidationError(
            `track ${trackId} 不存在 bilibiliMetadata（可能非 bilibili 源或元数据未创建）`,
          ),
        )
      }
      return okAsync(true as const)
    })
  }

  /**
   * 更新 bilibiliMetadata.cid
   * PlaybackFacade 在播放时若发现 cid=null（如 syncFavorite 批量入库未填 cid），
   * 会调 getVideoDetails 拿 cid 后回写。仅 bilibili 源 track 有效。
   */
  public updateBilibiliCid(
    trackId: number,
    cid: number,
  ): ResultAsync<true, ServiceError | DatabaseError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db
          .update(schema.bilibiliMetadata)
          .set({ cid })
          .where(eq(schema.bilibiliMetadata.trackId, trackId))
          .run(),
      ),
      (e) =>
        new DatabaseError(`更新 bilibiliMetadata.cid 失败：trackId=${trackId}`, {
          cause: e,
        }),
    ).andThen((result) => {
      if (result.changes === 0) {
        return errAsync(
          createValidationError(
            `track ${trackId} 不存在 bilibiliMetadata（可能非 bilibili 源或元数据未创建）`,
          ),
        )
      }
      return okAsync(true as const)
    })
  }

  /**
   * 根据 Bilibili 元数据获取 track
   */
  public getTrackByBilibiliMetadata(
    bilibiliMetadata: BilibiliMetadataPayload,
  ): ResultAsync<Track, ServiceError | DatabaseError> {
    const identifier = generateUniqueTrackKey({
      source: 'bilibili',
      bilibiliMetadata,
    })
    if (identifier.isErr()) {
      return errAsync(identifier.error)
    }
    return this.getTrackByUniqueKey(identifier.value)
  }

  /**
   * 通过 uniqueKey 获取 track
   */
  public getTrackByUniqueKey(
    uniqueKey: string,
  ): ResultAsync<Track, ServiceError | DatabaseError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.tracks
          .findFirst({
            where: eq(schema.tracks.uniqueKey, uniqueKey),
            with: {
              artist: true,
              bilibiliMetadata: true,
              localMetadata: true,
            },
          })
          .sync(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('根据 uniqueKey 查找 track 失败', { cause: e }),
    ).andThen((dbTrack) => {
      const formatted = this.formatTrack(dbTrack)
      if (!formatted) {
        return errAsync(createTrackNotFound(`uniqueKey=${uniqueKey}`))
      }
      return okAsync(formatted)
    })
  }

  /**
   * 查找 track，如果不存在则根据提供的 payload 创建一个新的
   * 唯一性检查基于 generateUniqueTrackKey 生成的 uniqueKey
   */
  public findOrCreateTrack(
    payload: CreateTrackPayload,
  ): ResultAsync<Track, ServiceError | DatabaseError> {
    const uniqueKeyResult = generateUniqueTrackKey(payload)
    if (uniqueKeyResult.isErr()) {
      return errAsync(uniqueKeyResult.error)
    }
    const uniqueKey = uniqueKeyResult.value

    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.tracks
          .findFirst({
            where: (track, { eq: eqFn }) => eqFn(track.uniqueKey, uniqueKey),
            with: {
              artist: true,
              bilibiliMetadata: true,
              localMetadata: true,
            },
          })
          .sync(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('根据 uniqueKey 查找 track 失败', { cause: e }),
    )
      .andThen((dbTrack) => {
        if (dbTrack) {
          const formatted = this.formatTrack(dbTrack)
          if (formatted) return okAsync(formatted)
          return errAsync(
            createValidationError(
              `已存在的 track ${dbTrack.id} source 与 metadata 不匹配`,
            ),
          )
        }
        return errAsync(createTrackNotFound(uniqueKey))
      })
      .orElse((error) => {
        if (error instanceof ServiceError && error.type === 'TrackNotFound') {
          return this._createTrack(payload)
        }
        return errAsync(error)
      })
  }

  /**
   * 批量查找或创建 tracks，并处理其关联的元数据
   * 返回 uniqueKey -> trackId 映射
   * sync 流程的核心方法
   * 同步变体：返回 Result，可在事务回调内调用
   */
  public findOrCreateManyTracksSync(
    payloads: CreateTrackPayload[],
    source: Track['source'],
  ): Result<Map<string, number>, ServiceError | DatabaseError> {
    if (payloads.length === 0) {
      return ok(new Map<string, number>())
    }

    // 校验所有 payload source 一致，并生成 uniqueKey
    const processedPayloadsResult = Result.combine(
      payloads.map((p) => {
        if (p.source !== source) {
          return err(createValidationError('source 不一致'))
        }
        return generateUniqueTrackKey(p).map((uniqueKey) => ({
          uniqueKey,
          payload: p,
        }))
      }),
    )
    if (processedPayloadsResult.isErr()) {
      return err(processedPayloadsResult.error)
    }

    // 按 uniqueKey 去重
    const uniquePayloadsMap = new Map<
      string,
      { uniqueKey: string; payload: CreateTrackPayload }
    >()
    for (const p of processedPayloadsResult.value) {
      if (!uniquePayloadsMap.has(p.uniqueKey)) {
        uniquePayloadsMap.set(p.uniqueKey, p)
      }
    }
    const processedPayloads = Array.from(uniquePayloadsMap.values())
    const uniqueKeys = processedPayloads.map((p) => p.uniqueKey)

    try {
      // 批量插入 tracks，冲突忽略
      const trackValuesToInsert = processedPayloads.map(
        ({ uniqueKey, payload }) =>
          ({
            title: payload.title,
            artistId: payload.artistId,
            coverUrl: payload.coverUrl,
            duration: payload.duration,
            uniqueKey,
            source: payload.source,
          }) satisfies CreateTrackPayloadBase & {
            uniqueKey: string
            source: string
          },
      )

      this.db
        .insert(schema.tracks)
        .values(trackValuesToInsert)
        .onConflictDoNothing()
        .run()

      // 查询所有匹配的 track
      const allTracks = this.db.query.tracks
        .findMany({
          where: and(inArray(schema.tracks.uniqueKey, uniqueKeys)),
          columns: { id: true, uniqueKey: true },
        })
        .sync()

      const finalUniqueKeyToIdMap = new Map(
        allTracks.map((t) => [t.uniqueKey, t.id]),
      )
      if (finalUniqueKeyToIdMap.size !== uniqueKeys.length) {
        throw new DatabaseError(
          '创建或查找 tracks 后数据不一致，部分 track 未能成功写入或查询',
        )
      }

      // 写入分表元数据
      switch (source) {
        case 'bilibili': {
          const bilibiliMetadataValues = processedPayloads.map(
            ({ uniqueKey, payload }) => {
              const trackId = finalUniqueKeyToIdMap.get(uniqueKey)
              if (trackId === undefined) {
                throw new ServiceError(
                  `无法为 ${uniqueKey} 找到 trackId（不应发生）`,
                )
              }
              const bilibiliMeta = (payload as CreateBilibiliTrackPayload)
                .bilibiliMetadata
              return {
                trackId,
                bvid: bilibiliMeta.bvid,
                cid: bilibiliMeta.cid,
                isMultiPage: bilibiliMeta.isMultiPage,
                mainTrackTitle: bilibiliMeta.mainTrackTitle,
                videoIsValid: bilibiliMeta.videoIsValid,
              }
            },
          )
          if (bilibiliMetadataValues.length > 0) {
            this.db
              .insert(schema.bilibiliMetadata)
              .values(bilibiliMetadataValues)
              .onConflictDoNothing()
              .run()
          }
          break
        }
        case 'local': {
          throw createNotImplementedError(
            '处理 local source 的批量创建逻辑尚未实现',
          )
        }
      }

      // 按原始 uniqueKey 顺序输出
      const orderedMap = new Map<string, number>()
      for (const uniqueKey of uniqueKeys) {
        const trackId = finalUniqueKeyToIdMap.get(uniqueKey)
        if (trackId === undefined) {
          throw new DatabaseError(
            `uniqueKey ${uniqueKey} 未能映射到 trackId（不应发生）`,
          )
        }
        orderedMap.set(uniqueKey, trackId)
      }
      return ok(orderedMap)
    } catch (e) {
      return err(
        e instanceof ServiceError
          ? e
          : new DatabaseError('批量查找或创建 tracks 失败', { cause: e }),
      )
    }
  }

  /**
   * 批量查找或创建 tracks，并处理其关联的元数据
   * 返回 uniqueKey -> trackId 映射
   * sync 流程的核心方法
   */
  public findOrCreateManyTracks(
    payloads: CreateTrackPayload[],
    source: Track['source'],
  ): ResultAsync<Map<string, number>, ServiceError | DatabaseError> {
    return new ResultAsync(
      Promise.resolve(this.findOrCreateManyTracksSync(payloads, source)),
    )
  }

  /**
   * 根据 uniqueKey 批量查找 track 的 ID（仅查询，不创建）
   * 同步变体：返回 Result，可在事务回调内调用
   */
  public findTrackIdsByUniqueKeysSync(
    uniqueKeys: string[],
  ): Result<Map<string, number>, DatabaseError> {
    if (uniqueKeys.length === 0) {
      return ok(new Map<string, number>())
    }
    try {
      const existingTracks = this.db.query.tracks
        .findMany({
          where: and(inArray(schema.tracks.uniqueKey, uniqueKeys)),
          columns: { id: true, uniqueKey: true },
        })
        .sync()
      const map = new Map<string, number>()
      for (const t of existingTracks) {
        map.set(t.uniqueKey, t.id)
      }
      return ok(map)
    } catch (e) {
      return err(new DatabaseError('批量查找 tracks 失败', { cause: e }))
    }
  }

  /**
   * 根据 uniqueKey 批量查找 track 的 ID（仅查询，不创建）
   */
  public findTrackIdsByUniqueKeys(
    uniqueKeys: string[],
  ): ResultAsync<Map<string, number>, DatabaseError> {
    return new ResultAsync(
      Promise.resolve(this.findTrackIdsByUniqueKeysSync(uniqueKeys)),
    )
  }
}

/**
 * 工厂函数
 */
export function makeTrackService(db: DBLike): TrackService {
  return new TrackService(db)
}
