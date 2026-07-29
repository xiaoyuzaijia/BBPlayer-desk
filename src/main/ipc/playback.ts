// playback 模块 IPC handler
// 把 PlaybackFacade 暴露给渲染进程
// 错误映射：PlaybackFacadeError → PlaybackErrorCode
import { ipcMain } from 'electron'

import { PLAYBACK_CHANNELS } from '../../shared/ipc-channels'
import type {
  PlaybackErrorCode,
  Result,
} from '../../shared/ipc-types'
import { BilibiliApiError } from '../lib/errors/bilibili'
import { DatabaseError, FacadeError, ServiceError } from '../lib/errors'
import { getPlaybackFacade } from '../lib/facades/playback'
import type { PlaybackFacadeError } from '../lib/facades/playback'

/**
 * 把 PlaybackFacadeError 映射为 PlaybackErrorCode
 */
function toPlaybackErrorCode(e: PlaybackFacadeError): PlaybackErrorCode {
  if (e instanceof BilibiliApiError) return 'BILIBILI_REJECTED'
  if (e instanceof DatabaseError) return 'DATABASE'
  if (e instanceof FacadeError) {
    // 视频失效复用了 FetchRemotePlaylistMetadataFailed 类型
    return 'FACADE'
  }
  if (e instanceof ServiceError) {
    if (e.type === 'TrackNotFound') return 'NOT_FOUND'
    if (e.type === 'Validation') return 'VALIDATION'
    return 'SERVICE'
  }
  return 'UNKNOWN'
}

function toPlaybackErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function registerPlaybackIpc(): void {
  ipcMain.handle(
    PLAYBACK_CHANNELS.getAudioUrl,
    async (_e, trackId: number): Promise<Result<string, PlaybackErrorCode>> => {
      const facade = getPlaybackFacade()
      const r = await facade.getAudioUrl(trackId)
      return r.match<
        | { ok: true; data: string }
        | { ok: false; error: { code: PlaybackErrorCode; message: string } }
      >(
        (url) => ({ ok: true, data: url }),
        (error) => ({
          ok: false,
          error: {
            code: toPlaybackErrorCode(error),
            message: toPlaybackErrorMessage(error),
          },
        }),
      )
    },
  )

  ipcMain.handle(
    PLAYBACK_CHANNELS.refreshAudioUrl,
    async (
      _e,
      trackId: number,
    ): Promise<Result<string, PlaybackErrorCode>> => {
      const facade = getPlaybackFacade()
      const r = await facade.refreshAudioUrlByTrackId(trackId)
      return r.match<
        | { ok: true; data: string }
        | { ok: false; error: { code: PlaybackErrorCode; message: string } }
      >(
        (url) => ({ ok: true, data: url }),
        (error) => ({
          ok: false,
          error: {
            code: toPlaybackErrorCode(error),
            message: toPlaybackErrorMessage(error),
          },
        }),
      )
    },
  )
}
