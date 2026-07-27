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
