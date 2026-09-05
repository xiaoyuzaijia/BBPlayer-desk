// lyric 模块 IPC handler
// 把 LyricFacade 暴露给渲染进程
// 错误映射：LyricNotFoundError → NOT_FOUND；ThirdPartyError → THIRD_PARTY/NETWORK；
//          ServiceError → SERVICE；FacadeError → FACADE；其他 → UNKNOWN
import { ipcMain } from 'electron'

import { LYRIC_CHANNELS } from '../../shared/ipc-channels'
import type {
  LyricErrorCode,
  LyricFileData,
  LyricSearchResult,
  LyricSearchResultItem,
  LyricSearchSource,
  LyricSource,
  Result,
} from '../../shared/ipc-types'
import {
  DatabaseError,
  FacadeError,
  LyricNotFoundError,
  ServiceError,
  ThirdPartyError,
} from '../lib/errors'
import { getLyricFacade } from '../lib/facades/lyric'

/**
 * 主进程内部 LyricFileData → IPC LyricFileData
 * 当前字段完全一致（都是 number 时间戳，无 Date 转换），直接透传
 * 保留函数以便未来字段调整时统一处理
 */
function toIpcLyricFileData(data: {
  id: string
  updateTime: number
  lrc?: string
  tlyric?: string
  romalrc?: string
  errorMessage?: string
}): LyricFileData {
  return data
}

/**
 * 错误码映射
 * - LyricNotFoundError: 多源竞速全部失败（最常见）
 * - ThirdPartyError: API 调用失败（网络/响应解析）
 *   - type='RequestFailed' → NETWORK（可重试）
 *   - 其他 type → THIRD_PARTY
 * - ServiceError: lyricService 文件读写失败
 * - FacadeError: 编排逻辑错误
 * - DatabaseError: track 查询失败
 */
function toLyricErrorCode(e: unknown): LyricErrorCode {
  if (e instanceof LyricNotFoundError) return 'NOT_FOUND'
  if (e instanceof ThirdPartyError) {
    return e.type === 'RequestFailed' ? 'NETWORK' : 'THIRD_PARTY'
  }
  if (e instanceof ServiceError) return 'SERVICE'
  if (e instanceof DatabaseError) return 'SERVICE' // DB 错误也归 SERVICE
  if (e instanceof FacadeError) return 'FACADE'
  return 'UNKNOWN'
}

function toLyricErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function registerLyricIpc(): void {
  // 获取歌词（缓存 + 网络竞速）
  ipcMain.handle(
    LYRIC_CHANNELS.getLyrics,
    async (
      _e,
      trackId: number,
      source: LyricSource = 'auto',
    ): Promise<Result<LyricFileData, LyricErrorCode>> => {
      const facade = getLyricFacade()
      const r = await facade.getLyrics(trackId, source)
      return r.match<
        | { ok: true; data: LyricFileData }
        | { ok: false; error: { code: LyricErrorCode; message: string } }
      >(
        (data) => ({ ok: true, data: toIpcLyricFileData(data) }),
        (error) => ({
          ok: false,
          error: {
            code: toLyricErrorCode(error),
            message: toLyricErrorMessage(error),
          },
        }),
      )
    },
  )

  // 手动搜索：按关键词搜索歌词元信息（不下载歌词内容）
  ipcMain.handle(
    LYRIC_CHANNELS.searchLyrics,
    async (
      _e,
      source: LyricSearchSource,
      keyword: string,
    ): Promise<Result<LyricSearchResult, LyricErrorCode>> => {
      const facade = getLyricFacade()
      const r = await facade.searchLyrics(source, keyword)
      return r.match<
        | { ok: true; data: LyricSearchResult }
        | { ok: false; error: { code: LyricErrorCode; message: string } }
      >(
        (data) => ({ ok: true, data }),
        (error) => ({
          ok: false,
          error: {
            code: toLyricErrorCode(error),
            message: toLyricErrorMessage(error),
          },
        }),
      )
    },
  )

  // 手动搜索：按选中结果获取歌词并写缓存
  ipcMain.handle(
    LYRIC_CHANNELS.fetchLyrics,
    async (
      _e,
      trackId: number,
      item: LyricSearchResultItem,
    ): Promise<Result<LyricFileData, LyricErrorCode>> => {
      const facade = getLyricFacade()
      const r = await facade.fetchLyricsFromSearch(trackId, item)
      return r.match<
        | { ok: true; data: LyricFileData }
        | { ok: false; error: { code: LyricErrorCode; message: string } }
      >(
        (data) => ({ ok: true, data: toIpcLyricFileData(data) }),
        (error) => ({
          ok: false,
          error: {
            code: toLyricErrorCode(error),
            message: toLyricErrorMessage(error),
          },
        }),
      )
    },
  )

  // 清空所有歌词缓存（设置页"清除缓存"用）
  ipcMain.handle(
    LYRIC_CHANNELS.clearAllLyrics,
    async (): Promise<Result<true, LyricErrorCode>> => {
      const facade = getLyricFacade()
      const r = await facade.clearAllLyrics()
      return r.match<
        | { ok: true; data: true }
        | { ok: false; error: { code: LyricErrorCode; message: string } }
      >(
        () => ({ ok: true, data: true }),
        (error) => ({
          ok: false,
          error: {
            code: toLyricErrorCode(error),
            message: toLyricErrorMessage(error),
          },
        }),
      )
    },
  )
}
