// 错误基类（迁移自 BBPlayer apps/mobile/src/lib/errors/index.ts）
// 主进程错误类层次：CustomError 为所有业务错误基类

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

// Service 层错误（单表 CRUD）
export class ServiceError extends CustomError {}

// Facade 层错误（跨资源编排）
export class FacadeError extends CustomError {}

// 数据库错误（better-sqlite3 / Drizzle 异常包装）
export class DatabaseError extends CustomError {}

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

/**
 * 歌词未找到错误（多源竞速全部失败时抛）
 * 对应 BBPlayer LyricNotFoundError（type='LyricNotFound'）
 * BBPlayer 把它放在 errors/index.ts，本项目保持一致（避免循环依赖）
 */
export class LyricNotFoundError extends CustomError {}
