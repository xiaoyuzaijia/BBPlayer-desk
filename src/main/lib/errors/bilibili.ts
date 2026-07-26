// BilibiliApiError（1:1 复刻 BBPlayer apps/mobile/src/lib/errors/thirdparty/bilibili.ts）
import { ThirdPartyError } from './index'

export type BilibiliApiErrorType =
  | 'RequestFailed'
  | 'ResponseFailed'
  | 'NoCookie'
  | 'CsrfError'
  | 'AudioStreamError'
  | 'RequestAborted'
  | 'InvalidArgument'

interface BilibiliApiErrorDetails {
  message: string
  msgCode?: number
  rawData?: unknown
  type?: BilibiliApiErrorType
  cause?: unknown
}

interface BilibiliErrorData {
  msgCode: number
  rawData: unknown
}

export class BilibiliApiError extends ThirdPartyError {
  readonly data: BilibiliErrorData
  readonly type?: BilibiliApiErrorType
  constructor({
    message,
    msgCode,
    rawData,
    type,
    cause,
  }: BilibiliApiErrorDetails) {
    super(message, {
      vendor: 'Bilibili',
      type,
      data: {
        rawData,
        msgCode,
      },
      cause,
    })
    this.data = {
      rawData,
      msgCode: msgCode ?? 0,
    }
    this.type = type
  }
}
