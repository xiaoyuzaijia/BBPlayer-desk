// history 模块 IPC handler
// 把 historyService 暴露给渲染进程
// 错误映射：DatabaseError / ServiceError → HistoryErrorCode
import { ipcMain } from 'electron'

import { HISTORY_CHANNELS } from '../../shared/ipc-channels'
import type {
  HistoryErrorCode,
  PlayRecordPayload,
  Result,
  Track,
} from '../../shared/ipc-types'
import { DatabaseError, ServiceError } from '../lib/errors'
import { getHistoryService } from '../lib/services'
import type { Track as ServiceTrack } from '../lib/services/types'

/**
 * 把 ServiceTrack 转为 IPC 共享 Track 类型
 * Date → number (ms epoch)
 * 与 playlist.ts 中的 toIpcTrack 保持一致
 */
function toIpcTrack(t: ServiceTrack): Track {
  const base = {
    id: t.id,
    uniqueKey: t.uniqueKey,
    title: t.title,
    artist: t.artist
      ? {
          id: t.artist.id,
          name: t.artist.name,
          avatarUrl: t.artist.avatarUrl,
          signature: t.artist.signature,
          source: t.artist.source,
          remoteId: t.artist.remoteId,
          createdAt: t.artist.createdAt.getTime(),
          updatedAt: t.artist.updatedAt.getTime(),
        }
      : null,
    coverUrl: t.coverUrl,
    source: t.source,
    duration: t.duration,
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  }
  if (t.source === 'bilibili') {
    return {
      ...base,
      source: 'bilibili',
      bilibiliMetadata: {
        bvid: t.bilibiliMetadata.bvid,
        cid: t.bilibiliMetadata.cid,
        isMultiPage: t.bilibiliMetadata.isMultiPage,
        videoIsValid: t.bilibiliMetadata.videoIsValid,
        mainTrackTitle: t.bilibiliMetadata.mainTrackTitle,
      },
    }
  }
  return {
    ...base,
    source: 'local',
    localMetadata: { localPath: t.localMetadata.localPath },
  }
}

function toHistoryErrorCode(e: unknown): HistoryErrorCode {
  if (e instanceof DatabaseError) return 'DATABASE'
  if (e instanceof ServiceError) return 'SERVICE'
  return 'UNKNOWN'
}

function toHistoryErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function registerHistoryIpc(): void {
  // 记录一次播放
  ipcMain.handle(
    HISTORY_CHANNELS.record,
    async (
      _e,
      payload: PlayRecordPayload,
    ): Promise<Result<true, HistoryErrorCode>> => {
      const historyService = getHistoryService()
      const r = await historyService.record(payload.trackId, {
        startTime: payload.startTime,
        durationPlayed: payload.durationPlayed,
        completed: payload.completed,
      })
      return r.match<
        | { ok: true; data: true }
        | { ok: false; error: { code: HistoryErrorCode; message: string } }
      >(
        () => ({ ok: true, data: true }),
        (error) => ({
          ok: false,
          error: {
            code: toHistoryErrorCode(error),
            message: toHistoryErrorMessage(error),
          },
        }),
      )
    },
  )

  // 获取最近 N 条播放历史
  ipcMain.handle(
    HISTORY_CHANNELS.getRecent,
    async (
      _e,
      limit?: number,
    ): Promise<Result<Track[], HistoryErrorCode>> => {
      const historyService = getHistoryService()
      const r = await historyService.getRecent(limit ?? 50)
      return r.match<
        | { ok: true; data: Track[] }
        | { ok: false; error: { code: HistoryErrorCode; message: string } }
      >(
        (records) => ({ ok: true, data: records.map((r) => r.track).map(toIpcTrack) }),
        (error) => ({
          ok: false,
          error: {
            code: toHistoryErrorCode(error),
            message: toHistoryErrorMessage(error),
          },
        }),
      )
    },
  )
}
