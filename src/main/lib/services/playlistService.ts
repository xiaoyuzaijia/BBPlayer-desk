// PlaylistService（复刻 BBPlayer apps/mobile/src/lib/services/playlistService.ts）
// 单表 CRUD：playlists / playlistTracks 表
// fractional indexing 排序：sortKey 越大越靠前，查询统一 DESC
// 去掉 BBPlayer 的 dynamic playlist / shared playlist 相关方法
//
// 重要：better-sqlite3 事务是同步的，事务回调内不能 await
// 因此提供 *Sync 变体方法（返回 Result 而非 ResultAsync），供 facade 在事务内调用
// 异步方法保留供 IPC handler / 顶层调用使用
import type { SQL } from 'drizzle-orm'
import { and, desc, eq, inArray, like, lt, or, sql } from 'drizzle-orm'
import { generateKeyBetween } from 'fractional-indexing'
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow'

import type { DBLike } from '../db'
import * as schema from '../db/schema'
import { ServiceError } from '../errors'
import {
  DatabaseError,
  createPlaylistNotFound,
  createTrackNotInPlaylist,
  createValidationError,
} from '../errors/service'
import type { TrackService } from './trackService'
import type {
  CreatePlaylistPayload,
  PlaylistType,
  ReorderLocalPlaylistTrackPayload,
  Track,
  UpdatePlaylistPayload,
} from './types'

type PlaylistTrackRow = typeof schema.playlistTracks.$inferSelect & {
  track: typeof schema.tracks.$inferSelect & {
    artist: typeof schema.artists.$inferSelect | null
    bilibiliMetadata: typeof schema.bilibiliMetadata.$inferSelect | null
    localMetadata: typeof schema.localMetadata.$inferSelect | null
  }
}

/**
 * 对内部 tracks 增删改只允许 local playlist
 * 远程 playlist（favorite/collection/multi_page）通过 replacePlaylistAllTracks 全量替换
 */
export class PlaylistService {
  private readonly db: DBLike
  private readonly trackService: TrackService

  constructor(db: DBLike, trackService: TrackService) {
    this.db = db
    this.trackService = trackService
  }

  /**
   * 返回一个使用新数据库连接（例如事务）的新实例
   */
  public withDB(conn: DBLike): PlaylistService {
    return new PlaylistService(conn, this.trackService.withDB(conn))
  }

  /**
   * 创建一个新的播放列表
   */
  public createPlaylist(
    payload: CreatePlaylistPayload,
  ): ResultAsync<typeof schema.playlists.$inferSelect, DatabaseError | ServiceError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const insertValues: typeof schema.playlists.$inferInsert = {
            title: payload.title,
            authorId: payload.authorId ?? null,
            description: payload.description ?? null,
            coverUrl: payload.coverUrl ?? null,
            type: payload.type,
            remoteSyncId: payload.remoteSyncId ?? null,
          }
          const [result] = this.db
            .insert(schema.playlists)
            .values(insertValues)
            .returning()
            .all()
          return result
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('创建播放列表失败', { cause: e }),
    )
  }

  /**
   * 更新播放列表元数据（标题/描述/封面/置顶）
   */
  public updatePlaylistMetadata(
    playlistId: number,
    payload: UpdatePlaylistPayload,
  ): ResultAsync<
    typeof schema.playlists.$inferSelect,
    DatabaseError | ServiceError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const existing = this.db.query.playlists
            .findFirst({
              where: eq(schema.playlists.id, playlistId),
            })
            .sync()
          if (!existing) throw createPlaylistNotFound(playlistId)

          const [updated] = this.db
            .update(schema.playlists)
            .set({
              title: payload.title ?? undefined,
              description: payload.description,
              coverUrl: payload.coverUrl,
              isPinned: payload.isPinned ?? undefined,
            })
            .where(eq(schema.playlists.id, playlistId))
            .returning()
            .all()
          return updated
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError(`更新播放列表 ${playlistId} 失败`, { cause: e }),
    )
  }

  /**
   * 删除播放列表（级联删除 playlistTracks）
   */
  public deletePlaylist(
    playlistId: number,
  ): ResultAsync<{ deletedId: number }, DatabaseError | ServiceError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const existing = this.db.query.playlists
            .findFirst({
              where: eq(schema.playlists.id, playlistId),
              columns: { id: true },
            })
            .sync()
          if (!existing) throw createPlaylistNotFound(playlistId)

          const [deleted] = this.db
            .delete(schema.playlists)
            .where(eq(schema.playlists.id, playlistId))
            .returning({ deletedId: schema.playlists.id })
            .all()
          return deleted
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError(`删除播放列表 ${playlistId} 失败`, { cause: e }),
    )
  }

  /**
   * 批量添加 tracks 到本地播放列表
   * 新 track 获得比当前最大 sortKey 更大的 key（generateKeyBetween(prevKey, null)），
   * 按 DESC 排序时排在列表最前
   */
  public addManyTracksToLocalPlaylist(
    playlistId: number,
    trackIds: number[],
  ): ResultAsync<
    (typeof schema.playlistTracks.$inferSelect)[],
    DatabaseError | ServiceError
  > {
    if (trackIds.length === 0) return okAsync([])

    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          // 验证播放列表存在且为 local
          const playlist = this.db.query.playlists
            .findFirst({
              where: and(
                eq(schema.playlists.id, playlistId),
                eq(schema.playlists.type, 'local'),
              ),
              columns: { id: true, itemCount: true },
            })
            .sync()
          if (!playlist) throw createPlaylistNotFound(playlistId)

          // 获取当前最大 sortKey（DESC 排序下，最大值对应列表首位）
          const maxKeyResult = this.db
            .select({
              maxKey: sql<string | null>`MAX(${schema.playlistTracks.sortKey})`,
            })
            .from(schema.playlistTracks)
            .where(eq(schema.playlistTracks.playlistId, playlistId))
            .all()
          let prevKey: string | null = maxKeyResult[0].maxKey ?? null

          // 每条用 generateKeyBetween(prevKey, null) 生成更大的 key（DESC 排序下排在最前）
          const values = trackIds.map((tid) => {
            const sortKey = generateKeyBetween(prevKey, null)
            prevKey = sortKey
            return { playlistId, trackId: tid, sortKey }
          })

          const inserted = this.db
            .insert(schema.playlistTracks)
            .values(values)
            .onConflictDoNothing({
              target: [
                schema.playlistTracks.playlistId,
                schema.playlistTracks.trackId,
              ],
            })
            .returning()
            .all()

          // 更新 itemCount
          if (inserted.length > 0) {
            this.db
              .update(schema.playlists)
              .set({
                itemCount: sql`${schema.playlists.itemCount} + ${inserted.length}`,
              })
              .where(eq(schema.playlists.id, playlistId))
              .run()
          }

          return inserted
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('批量添加歌曲到播放列表失败', { cause: e }),
    )
  }

  /**
   * 从本地播放列表批量移除歌曲
   * 返回 { removedTrackIds, missingTrackIds }
   */
  public batchRemoveTracksFromLocalPlaylist(
    playlistId: number,
    trackIdList: number[],
  ): ResultAsync<
    { removedTrackIds: number[]; missingTrackIds: number[] },
    DatabaseError | ServiceError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          if (trackIdList.length === 0) {
            return { removedTrackIds: [], missingTrackIds: [] }
          }

          // 验证播放列表存在且为 local
          const playlist = this.db.query.playlists
            .findFirst({
              where: and(
                eq(schema.playlists.id, playlistId),
                eq(schema.playlists.type, 'local'),
              ),
              columns: { id: true },
            })
            .sync()
          if (!playlist) throw createPlaylistNotFound(playlistId)

          // 批量删除关联记录，拿到实际删除的 trackId
          const deletedLinks = this.db
            .delete(schema.playlistTracks)
            .where(
              and(
                eq(schema.playlistTracks.playlistId, playlistId),
                inArray(schema.playlistTracks.trackId, trackIdList),
              ),
            )
            .returning({ trackId: schema.playlistTracks.trackId })
            .all()

          const removedTrackIds = deletedLinks.map((x) => x.trackId)
          const removedCount = removedTrackIds.length
          if (removedCount === 0) {
            throw createTrackNotInPlaylist(trackIdList[0], playlistId)
          }

          // 更新 itemCount（不小于 0）
          this.db
            .update(schema.playlists)
            .set({
              itemCount: sql`MAX(0, ${schema.playlists.itemCount} - ${removedCount})`,
            })
            .where(eq(schema.playlists.id, playlistId))
            .run()

          // 计算 missing 列表
          const removedSet = new Set(removedTrackIds)
          const missingTrackIds = trackIdList.filter((id) => !removedSet.has(id))
          return { removedTrackIds, missingTrackIds }
        })(),
      ),
      (e) => {
        if (e instanceof ServiceError) return e
        return new DatabaseError('从播放列表批量移除歌曲失败', { cause: e })
      },
    )
  }

  /**
   * 在本地播放列表中移动单个歌曲的位置（fractional indexing）
   * 只需知道目标槽位两侧的 sortKey，单行写入，无需移动其他行
   */
  public reorderSingleLocalPlaylistTrack(
    playlistId: number,
    payload: ReorderLocalPlaylistTrackPayload,
  ): ResultAsync<true, DatabaseError | ServiceError> {
    const { trackId, prevSortKey, nextSortKey } = payload

    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const playlist = this.db.query.playlists
            .findFirst({
              where: and(
                eq(schema.playlists.id, playlistId),
                eq(schema.playlists.type, 'local'),
              ),
              columns: { id: true },
            })
            .sync()
          if (!playlist) throw createPlaylistNotFound(playlistId)

          // 前置校验：prevSortKey 必须大于 nextSortKey（DESC 排序下）
          if (
            prevSortKey !== null &&
            nextSortKey !== null &&
            prevSortKey <= nextSortKey
          ) {
            throw new ServiceError(
              `Invalid sort keys: prevSortKey 必须大于 nextSortKey (got "${prevSortKey}" <= "${nextSortKey}")`,
            )
          }

          // 在 prevSortKey 和 nextSortKey 之间生成新 sortKey
          // 注意：fractional-indexing 约定 a < b，第一个参数是 smaller
          // 我们的 sortKey 是 DESC：越靠前越大，所以 prevSortKey(靠前) > nextSortKey(靠后)
          // 调用 generateKeyBetween(nextSortKey, prevSortKey) 得到中间值
          const newSortKey = generateKeyBetween(nextSortKey, prevSortKey)

          this.db
            .update(schema.playlistTracks)
            .set({ sortKey: newSortKey })
            .where(
              and(
                eq(schema.playlistTracks.playlistId, playlistId),
                eq(schema.playlistTracks.trackId, trackId),
              ),
            )
            .run()

          return true as const
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('重排序播放列表歌曲失败', { cause: e }),
    )
  }

  /**
   * 获取播放列表中的所有歌曲
   * 所有播放列表类型统一使用 DESC：位置越靠前的曲目 sortKey 越大
   */
  public getPlaylistTracks(
    playlistId: number,
  ): ResultAsync<Track[], DatabaseError | ServiceError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playlistTracks
          .findMany({
            where: eq(schema.playlistTracks.playlistId, playlistId),
            orderBy: desc(schema.playlistTracks.sortKey),
            with: {
              track: {
                with: {
                  artist: true,
                  bilibiliMetadata: true,
                  localMetadata: true,
                },
              },
            },
          })
          .sync() as PlaylistTrackRow[],
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('获取播放列表歌曲失败', { cause: e }),
    ).andThen((rows) => {
      const tracks: Track[] = []
      for (const row of rows) {
        const t = this.trackService.formatTrack(row.track)
        if (!t) {
          return errAsync(
            new ServiceError(
              `格式化歌曲 ${row.track.id} 时出错，可能 source 与 metadata 不匹配`,
            ),
          )
        }
        tracks.push(t)
      }
      return okAsync(tracks)
    })
  }

  /**
   * 获取所有 playlists
   * 排序：置顶 > updatedAt DESC
   */
  public getAllPlaylists(): ResultAsync<
    (typeof schema.playlists.$inferSelect & {
      author: typeof schema.artists.$inferSelect | null
    })[],
    DatabaseError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playlists
          .findMany({
            orderBy: [
              desc(schema.playlists.isPinned),
              desc(schema.playlists.updatedAt),
            ],
            with: { author: true },
          })
          .sync(),
      ),
      (e) => new DatabaseError('获取所有 playlists 失败', { cause: e }),
    )
  }

  /**
   * 获取指定 playlist 的元数据 + 统计（validTrackCount / totalDuration）
   * validTrackCount：排除 videoIsValid=false 的失效视频
   */
  public getPlaylistMetadata(playlistId: number): ResultAsync<
    | (typeof schema.playlists.$inferSelect & {
        author: typeof schema.artists.$inferSelect | null
      } & {
        validTrackCount: number
        totalDuration: number
      })
    | undefined,
    DatabaseError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playlists
          .findFirst({
            where: eq(schema.playlists.id, playlistId),
            with: { author: true },
            extras: {
              validTrackCount: sql<number>`(
                SELECT COUNT(pt.track_id)
                FROM ${schema.playlistTracks} AS pt
                LEFT JOIN ${schema.bilibiliMetadata} AS bm
                  ON pt.track_id = bm.track_id
                WHERE pt.playlist_id = ${playlistId}
                  AND (bm.video_is_valid IS NOT FALSE)
              )`.as('valid_track_count'),
              totalDuration: sql<number>`(
                SELECT COALESCE(SUM(t.duration), 0)
                FROM ${schema.playlistTracks} AS pt
                JOIN ${schema.tracks} AS t
                  ON pt.track_id = t.id
                LEFT JOIN ${schema.bilibiliMetadata} AS bm
                  ON pt.track_id = bm.track_id
                WHERE pt.playlist_id = ${playlistId}
                  AND (bm.video_is_valid IS NOT FALSE)
              )`.as('total_duration'),
            },
          })
          .sync(),
      ),
      (e) => new DatabaseError('获取 playlist 元数据失败', { cause: e }),
    )
  }

  /**
   * 根据 remoteSyncId + type 查找或创建一个本地同步的远程播放列表
   * 同步变体：返回 Result，可在事务回调内调用
   */
  public findOrCreateRemotePlaylistSync(
    payload: CreatePlaylistPayload,
  ): Result<typeof schema.playlists.$inferSelect, DatabaseError | ServiceError> {
    const { remoteSyncId, type } = payload
    if (!remoteSyncId || type === 'local') {
      return err(
        createValidationError(
          'findOrCreateRemotePlaylist 必须提供 remoteSyncId 和非 local 的 type',
        ),
      )
    }
    try {
      const existing = this.db.query.playlists
        .findFirst({
          where: and(
            eq(schema.playlists.remoteSyncId, remoteSyncId),
            eq(schema.playlists.type, type),
          ),
        })
        .sync()
      if (existing) return ok(existing)

      const [newPlaylist] = this.db
        .insert(schema.playlists)
        .values({
          title: payload.title,
          authorId: payload.authorId,
          description: payload.description,
          coverUrl: payload.coverUrl,
          type: payload.type,
          remoteSyncId: payload.remoteSyncId,
        })
        .returning()
        .all()
      return ok(newPlaylist)
    } catch (e) {
      return err(
        e instanceof ServiceError
          ? e
          : new DatabaseError('查找或创建远程播放列表失败', { cause: e }),
      )
    }
  }

  /**
   * 根据 remoteSyncId + type 查找或创建一个本地同步的远程播放列表
   */
  public findOrCreateRemotePlaylist(
    payload: CreatePlaylistPayload,
  ): ResultAsync<
    typeof schema.playlists.$inferSelect,
    DatabaseError | ServiceError
  > {
    return new ResultAsync(
      Promise.resolve(this.findOrCreateRemotePlaylistSync(payload)),
    )
  }

  /**
   * 用一个 track ID 数组**完全替换**播放列表内容
   * 远程同步专用：删旧全量写新，并更新 itemCount / lastSyncedAt
   * 同步变体：返回 Result，可在事务回调内调用
   */
  public replacePlaylistAllTracksSync(
    playlistId: number,
    trackIds: number[],
  ): Result<true, DatabaseError> {
    try {
      this.db
        .delete(schema.playlistTracks)
        .where(eq(schema.playlistTracks.playlistId, playlistId))
        .run()

      if (trackIds.length > 0) {
        // 倒序生成 sortKey：trackIds[0]（排列首位）获得最大的 sortKey
        // 与 local playlist 约定一致：位置越靠前 sortKey 越大，查询时统一 DESC
        let prevKey: string | null = null
        const sortKeys: string[] = new Array(trackIds.length)
        for (let i = trackIds.length - 1; i >= 0; i--) {
          sortKeys[i] = generateKeyBetween(prevKey, null)
          prevKey = sortKeys[i]
        }
        const newPlaylistTracks = trackIds.map((id, i) => ({
          playlistId,
          trackId: id,
          sortKey: sortKeys[i],
        }))
        this.db
          .insert(schema.playlistTracks)
          .values(newPlaylistTracks)
          .run()
      }

      this.db
        .update(schema.playlists)
        .set({
          itemCount: trackIds.length,
          lastSyncedAt: new Date(),
        })
        .where(eq(schema.playlists.id, playlistId))
        .run()

      return ok(true as const)
    } catch (e) {
      return err(
        new DatabaseError(`设置播放列表歌曲失败 (ID: ${playlistId})`, {
          cause: e,
        }),
      )
    }
  }

  /**
   * 用一个 track ID 数组**完全替换**播放列表内容
   * 远程同步专用：删旧全量写新，并更新 itemCount / lastSyncedAt
   */
  public replacePlaylistAllTracks(
    playlistId: number,
    trackIds: number[],
  ): ResultAsync<true, DatabaseError> {
    return new ResultAsync(
      Promise.resolve(this.replacePlaylistAllTracksSync(playlistId, trackIds)),
    )
  }

  /**
   * 基于 type & remoteId 查询一个播放列表
   */
  public findPlaylistByTypeAndRemoteId(
    type: PlaylistType,
    remoteId: number,
  ): ResultAsync<
    | (typeof schema.playlists.$inferSelect & {
        trackLinks: (typeof schema.playlistTracks.$inferSelect)[]
      })
    | undefined,
    DatabaseError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playlists
          .findFirst({
            where: and(
              eq(schema.playlists.type, type),
              eq(schema.playlists.remoteSyncId, remoteId),
            ),
            with: { trackLinks: true },
          })
          .sync(),
      ),
      (e) => new DatabaseError('查询播放列表失败', { cause: e }),
    )
  }

  /**
   * 根据 ID 获取播放列表
   */
  public getPlaylistById(playlistId: number) {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playlists
          .findFirst({
            where: eq(schema.playlists.id, playlistId),
            with: { author: true, trackLinks: true },
          })
          .sync(),
      ),
      (e) => new DatabaseError('查询播放列表失败', { cause: e }),
    )
  }

  /**
   * 搜索播放列表（按 title 模糊匹配）
   */
  public searchPlaylists(query: string): ResultAsync<
    (typeof schema.playlists.$inferSelect & {
      author: typeof schema.artists.$inferSelect | null
    })[],
    DatabaseError
  > {
    const trimmed = query.trim()
    if (!trimmed) return okAsync([])

    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playlists
          .findMany({
            where: like(schema.playlists.title, `%${trimmed}%`),
            orderBy: [
              desc(schema.playlists.isPinned),
              desc(schema.playlists.updatedAt),
            ],
            with: { author: true },
          })
          .sync(),
      ),
      (e) => new DatabaseError('搜索播放列表失败', { cause: e }),
    )
  }

  /**
   * 在某个 playlist 中按名字搜索歌曲
   */
  public searchTrackInPlaylist(
    playlistId: number,
    query: string,
  ): ResultAsync<Track[], DatabaseError | ServiceError> {
    const q = `%${query.trim().toLowerCase()}%`

    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const playlist = this.db.query.playlists
            .findFirst({
              columns: { type: true },
              where: eq(schema.playlists.id, playlistId),
            })
            .sync()
          if (!playlist) throw createPlaylistNotFound(playlistId)

          // 子查询：title 模糊匹配的 track id
          const trackIdSubq = this.db
            .select({ id: schema.tracks.id })
            .from(schema.tracks)
            .leftJoin(
              schema.artists,
              eq(schema.tracks.artistId, schema.artists.id),
            )
            .where(like(sql`lower(${schema.tracks.title})`, q))

          const rows = this.db.query.playlistTracks
            .findMany({
              where: and(
                eq(schema.playlistTracks.playlistId, playlistId),
                inArray(schema.playlistTracks.trackId, trackIdSubq),
              ),
              with: {
                track: {
                  with: {
                    artist: true,
                    bilibiliMetadata: true,
                    localMetadata: true,
                  },
                },
              },
              orderBy: desc(schema.playlistTracks.sortKey),
            })
            .sync() as PlaylistTrackRow[]

          const tracks: Track[] = []
          for (const row of rows) {
            const t = this.trackService.formatTrack(row.track)
            if (!t) {
              throw new ServiceError(
                `格式化歌曲 ${row.track.id} 时出错`,
              )
            }
            tracks.push(t)
          }
          return tracks
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('搜索歌曲失败', { cause: e }),
    )
  }

  /**
   * 游标分页获取播放列表中的歌曲
   * 排序：sortKey DESC, createdAt DESC, trackId DESC（保证稳定）
   */
  public getPlaylistTracksPaginated(options: {
    playlistId: number
    initialLimit?: number
    limit: number
    cursor:
      | { lastSortKey: string; createdAt: number; lastId: number }
      | undefined
  }): ResultAsync<
    {
      tracks: Track[]
      sortKeys: string[]
      nextCursor?: {
        lastSortKey: string
        createdAt: number
        lastId: number
      }
      nextPageFirstSortKey?: string
    },
    DatabaseError | ServiceError
  > {
    const { limit, cursor, playlistId, initialLimit } = options
    const effectiveLimit = cursor ? limit : (initialLimit ?? limit)

    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const playlist = this.db.query.playlists
            .findFirst({
              columns: { type: true },
              where: eq(schema.playlists.id, playlistId),
            })
            .sync()
          if (!playlist) throw createPlaylistNotFound(playlistId)

          const orderBy = [
            desc(schema.playlistTracks.sortKey),
            desc(schema.playlistTracks.createdAt),
            desc(schema.playlistTracks.trackId),
          ]

          const whereClauses: (SQL | undefined)[] = [
            eq(schema.playlistTracks.playlistId, playlistId),
          ]

          if (cursor) {
            const { lastSortKey, createdAt, lastId } = cursor
            const dateObj = new Date(createdAt)
            whereClauses.push(
              or(
                lt(schema.playlistTracks.sortKey, lastSortKey),
                and(
                  eq(schema.playlistTracks.sortKey, lastSortKey),
                  lt(schema.playlistTracks.createdAt, dateObj),
                ),
                and(
                  eq(schema.playlistTracks.sortKey, lastSortKey),
                  eq(schema.playlistTracks.createdAt, dateObj),
                  lt(schema.playlistTracks.trackId, lastId),
                ),
              ),
            )
          }

          return this.db.query.playlistTracks
            .findMany({
              where: and(...whereClauses),
              orderBy,
              limit: effectiveLimit + 1,
              with: {
                track: {
                  with: {
                    artist: true,
                    bilibiliMetadata: true,
                    localMetadata: true,
                  },
                },
              },
            })
            .sync() as PlaylistTrackRow[]
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError('分页获取播放列表歌曲失败', { cause: e }),
    ).andThen((data) => {
      const newTracks: Track[] = []
      const sortKeys: string[] = []
      for (const pt of data) {
        const t = this.trackService.formatTrack(pt.track)
        if (!t) {
          return errAsync(
            new ServiceError(
              `格式化歌曲 ${pt.track.id} 时出错，可能 source 与 metadata 不匹配`,
            ),
          )
        }
        newTracks.push(t)
        sortKeys.push(pt.sortKey)
      }

      let nextCursor: typeof cursor
      let nextPageFirstSortKey: string | undefined
      const hasMore = data.length === effectiveLimit + 1

      if (hasMore) {
        const lastItem = data[effectiveLimit - 1]
        nextCursor = {
          lastSortKey: lastItem.sortKey,
          createdAt: lastItem.createdAt.getTime(),
          lastId: lastItem.trackId,
        }
        nextPageFirstSortKey = data[effectiveLimit].sortKey
      }

      return okAsync({
        tracks: hasMore ? newTracks.slice(0, effectiveLimit) : newTracks,
        sortKeys: hasMore ? sortKeys.slice(0, effectiveLimit) : sortKeys,
        nextCursor,
        nextPageFirstSortKey,
      })
    })
  }
}

/**
 * 工厂函数
 */
export function makePlaylistService(
  db: DBLike,
  trackService: TrackService,
): PlaylistService {
  return new PlaylistService(db, trackService)
}
