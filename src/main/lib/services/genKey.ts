// 生成 track 的 uniqueKey（复刻 BBPlayer apps/mobile/src/lib/services/genKey.ts）
// 用于曲目池全局去重：source + 关键字段组合
import { err, ok, type Result } from 'neverthrow'

import {
  createNotImplementedError,
  createValidationError,
} from '../errors/service'
import type { ServiceError } from '../errors'
import type { TrackSourceData } from './types'

/**
 * 根据 source + metadata 生成全局唯一 key
 * - bilibili：分 P 用 source::bvid::cid，单 P 用 source::bvid
 * - local：用 source::localPath（暂未实现，BBPlayer 也未实现）
 */
export default function generateUniqueTrackKey(
  payload: TrackSourceData,
): Result<string, ServiceError> {
  switch (payload.source) {
    case 'bilibili': {
      const biliMeta = payload.bilibiliMetadata
      if (!biliMeta.bvid) {
        return err(createValidationError('bvid 不存在'))
      }
      return biliMeta.isMultiPage
        ? ok(`${payload.source}::${biliMeta.bvid}::${biliMeta.cid}`)
        : ok(`${payload.source}::${biliMeta.bvid}`)
    }
    case 'local': {
      // 基于 localPath 的业务主键不够稳定（文件可能改名）
      // BBPlayer 暂未实现，本项目也保持一致
      return err(
        createNotImplementedError('未实现 local source 的 uniqueKey 生成'),
      )
    }
    default: {
      // exhaustive check
      const _exhaustive: never = payload
      return err(
        createValidationError(`未知的 Track source: ${String(_exhaustive)}`),
      )
    }
  }
}
