// ArtistService（复刻 BBPlayer apps/mobile/src/lib/services/artistService.ts）
// 单表 CRUD：artists 表
// better-sqlite3 同步 API，但保留 ResultAsync 风格与 BBPlayer 一致
// 错误包装为 DatabaseError / ServiceError
//
// 重要：better-sqlite3 事务是同步的，事务回调内不能 await
// 因此提供 *Sync 变体方法（返回 Result 而非 ResultAsync），供 facade 在事务内调用
import { and, eq, or } from 'drizzle-orm'
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow'

import type { DBLike } from '../db'
import * as schema from '../db/schema'
import { ServiceError } from '../errors'
import {
  DatabaseError,
  createArtistNotFound,
  createValidationError,
} from '../errors/service'
import type {
  Artist,
  CreateArtistPayload,
  Track,
  UpdateArtistPayload,
} from './types'
import type { TrackService } from './trackService'

export class ArtistService {
  private readonly db: DBLike
  private readonly trackService: TrackService

  constructor(db: DBLike, trackService: TrackService) {
    this.db = db
    this.trackService = trackService
  }

  /**
   * 返回一个使用新数据库连接（例如事务）的新实例
   * 与 BBPlayer 一致：所有 service 都支持 withDB(tx) 注入事务
   */
  public withDB(conn: DBLike): ArtistService {
    return new ArtistService(conn, this.trackService.withDB(conn))
  }

  /**
   * 创建一个新的 artist
   */
  public createArtist(
    payload: CreateArtistPayload,
  ): ResultAsync<typeof schema.artists.$inferSelect, DatabaseError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db
          .insert(schema.artists)
          .values({
            name: payload.name,
            source: payload.source,
            remoteId: payload.remoteId,
            avatarUrl: payload.avatarUrl,
            signature: payload.signature,
          })
          .returning()
          .all(),
      ),
      (e) => new DatabaseError('创建 artist 失败', { cause: e }),
    ).andThen((result) => okAsync(result[0]))
  }

  /**
   * 根据 source + remoteId 查找或创建 artist
   * 主要用于外部源同步（bilibili）
   * 同步变体：返回 Result，可在事务回调内调用
   */
  public findOrCreateArtistSync(
    payload: CreateArtistPayload,
  ): Result<typeof schema.artists.$inferSelect, DatabaseError | ServiceError> {
    const { source, remoteId } = payload
    if (!source || !remoteId) {
      return err(
        createValidationError('findOrCreateArtist 需要 source 和 remoteId'),
      )
    }
    try {
      const existing = this.db.query.artists
        .findFirst({
          where: and(
            eq(schema.artists.source, source),
            eq(schema.artists.remoteId, remoteId),
          ),
        })
        .sync()
      if (existing) return ok(existing)

      const [newArtist] = this.db
        .insert(schema.artists)
        .values({
          name: payload.name,
          source: payload.source,
          remoteId: payload.remoteId,
          avatarUrl: payload.avatarUrl,
          signature: payload.signature,
        })
        .returning()
        .all()
      return ok(newArtist)
    } catch (e) {
      return err(
        e instanceof ServiceError
          ? e
          : new DatabaseError('查找或创建 artist 失败', { cause: e }),
      )
    }
  }

  /**
   * 根据 source + remoteId 查找或创建 artist
   * 主要用于外部源同步（bilibili）
   */
  public findOrCreateArtist(
    payload: CreateArtistPayload,
  ): ResultAsync<
    typeof schema.artists.$inferSelect,
    DatabaseError | ServiceError
  > {
    return new ResultAsync(
      Promise.resolve(this.findOrCreateArtistSync(payload)),
    )
  }

  /**
   * 更新 artist 信息
   */
  public updateArtist(
    artistId: number,
    payload: UpdateArtistPayload,
  ): ResultAsync<
    typeof schema.artists.$inferSelect,
    DatabaseError | ServiceError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const existing = this.db.query.artists
            .findFirst({
              where: eq(schema.artists.id, artistId),
              columns: { id: true },
            })
            .sync()
          if (!existing) throw createArtistNotFound(artistId)

          const [updated] = this.db
            .update(schema.artists)
            .set({
              name: payload.name ?? undefined,
              avatarUrl: payload.avatarUrl,
              signature: payload.signature,
            })
            .where(eq(schema.artists.id, artistId))
            .returning()
            .all()
          return updated
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError(`更新 artist ${artistId} 失败`, { cause: e }),
    )
  }

  /**
   * 删除 artist（关联的 track.artistId 会被设为 null）
   */
  public deleteArtist(
    artistId: number,
  ): ResultAsync<{ deletedId: number }, DatabaseError | ServiceError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        (() => {
          const existing = this.db.query.artists
            .findFirst({
              where: eq(schema.artists.id, artistId),
              columns: { id: true },
            })
            .sync()
          if (!existing) throw createArtistNotFound(artistId)

          const [deleted] = this.db
            .delete(schema.artists)
            .where(eq(schema.artists.id, artistId))
            .returning({ deletedId: schema.artists.id })
            .all()
          return deleted
        })(),
      ),
      (e) =>
        e instanceof ServiceError
          ? e
          : new DatabaseError(`删除 artist ${artistId} 失败`, { cause: e }),
    )
  }

  /**
   * 获取指定 artist 的所有歌曲
   */
  public getArtistTracks(
    artistId: number,
  ): ResultAsync<Track[], DatabaseError | ServiceError> {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.tracks
          .findMany({
            where: eq(schema.tracks.artistId, artistId),
            with: {
              artist: true,
              bilibiliMetadata: true,
              localMetadata: true,
            },
          })
          .sync(),
      ),
      (e) =>
        new DatabaseError(`获取 artist ${artistId} 的歌曲失败`, { cause: e }),
    ).andThen((dbTracks) => {
      const formatted: Track[] = []
      for (const dbTrack of dbTracks) {
        const f = this.trackService.formatTrack(dbTrack)
        if (!f) {
          return errAsync(
            new ServiceError(
              `格式化 track ${dbTrack.id} 时出错，可能 source 与 metadata 不匹配`,
            ),
          )
        }
        formatted.push(f)
      }
      return okAsync(formatted)
    })
  }

  /**
   * 获取所有 artist
   */
  public getAllArtists(): ResultAsync<
    (typeof schema.artists.$inferSelect)[],
    DatabaseError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(this.db.query.artists.findMany().sync()),
      (e) => new DatabaseError('获取所有 artist 失败', { cause: e }),
    )
  }

  /**
   * 根据 ID 获取 artist
   */
  public getArtistById(
    artistId: number,
  ): ResultAsync<
    typeof schema.artists.$inferSelect | undefined,
    DatabaseError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.artists
          .findFirst({
            where: eq(schema.artists.id, artistId),
          })
          .sync(),
      ),
      (e) =>
        new DatabaseError(`通过 ID ${artistId} 获取 artist 失败`, {
          cause: e,
        }),
    )
  }

  /**
   * 批量查找或创建 remote artist（sync 时先用）
   * 返回 remoteId -> artist 映射
   * 同步变体：返回 Result，可在事务回调内调用
   */
  public findOrCreateManyRemoteArtistsSync(
    payloads: CreateArtistPayload[],
  ): Result<
    Map<string, typeof schema.artists.$inferSelect>,
    ServiceError | DatabaseError
  > {
    if (payloads.length === 0) {
      return ok(new Map<string, typeof schema.artists.$inferSelect>())
    }

    // 类型守卫：确保所有 payload 都有 source 和 remoteId
    const validPayloads = payloads.filter(
      (p): p is CreateArtistPayload & { source: 'bilibili' | 'local'; remoteId: string } =>
        !!p.source && !!p.remoteId,
    )
    if (validPayloads.length !== payloads.length) {
      return err(
        createValidationError(
          'payloads 中存在 source 或 remoteId 为空的对象，该方法仅用于 remote artist',
        ),
      )
    }

    try {
      // 批量插入，冲突忽略
      this.db
        .insert(schema.artists)
        .values(
          validPayloads.map((p) => ({
            name: p.name,
            source: p.source,
            remoteId: p.remoteId,
            avatarUrl: p.avatarUrl,
            signature: p.signature,
          })),
        )
        .onConflictDoNothing()
        .run()

      // 查询所有匹配的 artist
      const findConditions = validPayloads.map((p) =>
        and(
          eq(schema.artists.source, p.source),
          eq(schema.artists.remoteId, p.remoteId),
        ),
      )
      const allArtists = this.db.query.artists
        .findMany({
          where: or(...findConditions),
        })
        .sync()

      // 检查数据一致性
      const fullArtists = validPayloads.map((p) => {
        const existing = allArtists.find(
          (a) =>
            `${a.source}::${a.remoteId}` === `${p.source}::${p.remoteId}`,
        )
        if (!existing) {
          throw new DatabaseError(
            `批量查找或创建 artist 后数据不一致，未找到 artist: ${p.source}::${p.remoteId}`,
          )
        }
        return existing
      })

      return ok(
        new Map(
          fullArtists.map((a) => {
            // 前面已经过滤掉 remoteId 为空的 payload，这里 a.remoteId 必有
            if (!a.remoteId) {
              throw new DatabaseError(
                `artist ${a.id} 的 remoteId 为空（数据不一致）`,
              )
            }
            return [a.remoteId, a]
          }),
        ),
      )
    } catch (e) {
      return err(
        e instanceof ServiceError
          ? e
          : new DatabaseError('批量查找或创建 artist 失败', { cause: e }),
      )
    }
  }

  /**
   * 批量查找或创建 remote artist（sync 时先用）
   * 返回 remoteId -> artist 映射
   */
  public findOrCreateManyRemoteArtists(
    payloads: CreateArtistPayload[],
  ): ResultAsync<
    Map<string, typeof schema.artists.$inferSelect>,
    ServiceError | DatabaseError
  > {
    return new ResultAsync(
      Promise.resolve(this.findOrCreateManyRemoteArtistsSync(payloads)),
    )
  }
}

/**
 * 工厂函数：根据传入的 db 和 trackService 创建实例
 * 主进程模块级单例在 db/services/index.ts 中初始化
 */
export function makeArtistService(
  db: DBLike,
  trackService: TrackService,
): ArtistService {
  return new ArtistService(db, trackService)
}

// 工具函数：把 DB row 转成共享 Artist 类型
export function formatArtist(
  row: typeof schema.artists.$inferSelect,
): Artist {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl,
    signature: row.signature,
    source: row.source,
    remoteId: row.remoteId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
