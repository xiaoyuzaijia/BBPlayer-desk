// 错误基类（迁移自 BBPlayer apps/mobile/src/lib/errors/index.ts）
// 主进程只保留 CustomError / ThirdPartyError 两个基类

export class CustomError extends Error {
  readonly type?: string
  readonly data?: unknown
  constructor(
    message: string,
    opts?: { type?: string; data?: unknown; cause?: unknown },
  ) {
    super(message, { cause: opts?.cause })
    this.name = this.constructor.name
    this.type = opts?.type
    this.data = opts?.data
  }
}

export class ThirdPartyError extends CustomError {
  readonly vendor?: string
  readonly type?: string
  readonly data?: unknown
  constructor(
    message: string,
    opts?: { vendor?: string; type?: string; data?: unknown; cause?: unknown },
  ) {
    super(message, { type: opts?.type, data: opts?.data, cause: opts?.cause })
    this.vendor = opts?.vendor
    this.type = opts?.type
    this.data = opts?.data
  }
}
