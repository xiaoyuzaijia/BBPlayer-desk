// HistoryService（简化版，不在 BBPlayer 原结构中作为独立 service）
// 提供 playHistory 表的写入与最近 N 条查询
// 复杂统计（playCount 排行 / 总播放时长）后续阶段再补
import { desc, eq } from 'drizzle-orm'
import { ResultAsync, okAsync } from 'neverthrow'

import type { DBLike } from '../db'
import * as schema from '../db/schema'
import { DatabaseError } from '../errors/service'
import type { TrackService } from './trackService'
import type { PlayRecord, Track } from './types'

export class HistoryService {
  private readonly db: DBLike
  private readonly trackService: TrackService

  constructor(db: DBLike, trackService: TrackService) {
    this.db = db
    this.trackService = trackService
  }

  /**
   * 返回一个使用新数据库连接（例如事务）的新实例
   */
  public withDB(conn: DBLike): HistoryService {
    return new HistoryService(conn, this.trackService.withDB(conn))
  }

  /**
   * 记录一次播放
   */
  public record(
    trackId: number,
    record: PlayRecord,
  ): ResultAsync<true, DatabaseError> {
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
      (e) => new DatabaseError(`记录播放历史失败 (trackId=${trackId})`, { cause: e }),
    ).andThen(() => okAsync(true as const))
  }

  /**
   * 获取最近 N 条播放历史（按 startTime DESC）
   * 返回 { track, startTime, durationPlayed, completed } 列表
   */
  public getRecent(limit = 50): ResultAsync<
    Array<{
      track: Track
      startTime: number
      durationPlayed: number
      completed: boolean
      createdAt: Date
    }>,
    DatabaseError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playHistory
          .findMany({
            orderBy: desc(schema.playHistory.startTime),
            limit,
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
          .sync(),
      ),
      (e) => new DatabaseError('获取最近播放历史失败', { cause: e }),
    ).andThen((rows) => {
      const result: Array<{
        track: Track
        startTime: number
        durationPlayed: number
        completed: boolean
        createdAt: Date
      }> = []
      for (const row of rows) {
        const track = this.trackService.formatTrack(row.track)
        if (!track) continue // 跳过数据不一致的记录
        result.push({
          track,
          startTime: row.startTime,
          durationPlayed: row.durationPlayed,
          completed: row.completed,
          createdAt: row.createdAt,
        })
      }
      return okAsync(result)
    })
  }

  /**
   * 获取指定 track 的播放历史
   */
  public getByTrackId(
    trackId: number,
  ): ResultAsync<
    (typeof schema.playHistory.$inferSelect)[],
    DatabaseError
  > {
    return ResultAsync.fromPromise(
      Promise.resolve(
        this.db.query.playHistory
          .findMany({
            where: eq(schema.playHistory.trackId, trackId),
            orderBy: desc(schema.playHistory.startTime),
          })
          .sync(),
      ),
      (e) =>
        new DatabaseError(`获取 track ${trackId} 的播放历史失败`, { cause: e }),
    )
  }
}

/**
 * 工厂函数
 */
export function makeHistoryService(
  db: DBLike,
  trackService: TrackService,
): HistoryService {
  return new HistoryService(db, trackService)
}
