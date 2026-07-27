// 数据库初始化与连接管理（better-sqlite3 + Drizzle）
// 与 BBPlayer apps/mobile/src/lib/db/db.ts 对应：
// - 启用外键约束（SQLite 默认关闭）
// - WAL 模式提升并发读写性能
// - synchronous=NORMAL 在 WAL 下足够安全且更快
// - 应用启动时自动执行 migrations 目录下的 SQL（drizzle-kit generate 产物）
import { app } from 'electron'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'

import * as schema from './schema'

let dbInstance: BetterSQLite3Database<typeof schema> | null = null
let rawDb: Database.Database | null = null

/**
 * 推断事务类型：drizzle better-sqlite3 事务回调参数
 * better-sqlite3 的事务是同步的，回调不能 await
 */
type Tx = Parameters<
  Parameters<BetterSQLite3Database<typeof schema>['transaction']>[0]
>[0]
export type DBLike = BetterSQLite3Database<typeof schema> | Tx

/**
 * Drizzle better-sqlite3 事务函数签名（同步）
 * 用于 facade 包裹多步写操作，保证原子性
 */
export type TransactionFn<T> = (tx: Tx) => T

/**
 * 获取数据库文件路径：userData/bbplayer-desk.db
 * - userData 由 Electron 根据 app 名自动决定
 * - 开发环境为 %APPDATA%/BBPlayer-desk（Windows）
 */
function getDbPath(): string {
  return join(app.getPath('userData'), 'bbplayer-desk.db')
}

/**
 * 获取 migrations 目录路径
 * - 开发：源码目录 src/main/lib/db/migrations
 * - 生产：打包到 out/main/migrations（electron-vite 默认打包资源）
 */
function getMigrationsFolder(): string {
  // __dirname 在 external 后保持源码相对路径
  // 开发时为 out/main/lib/db/index.js → migrations 在源码目录
  // 生产环境若打包到 out/main，migrations 也应跟随
  return join(__dirname, 'migrations')
}

/**
 * 应用所有未执行的迁移
 * - drizzle migrator 会自动创建 __drizzle_migrations 表跟踪状态
 * - 同时执行 migrations/meta/_journal.json 中记录的所有 SQL 文件
 */
function applyMigrations(db: BetterSQLite3Database<typeof schema>): void {
  const migrationsFolder = getMigrationsFolder()
  if (!existsSync(migrationsFolder)) {
    console.warn(
      `[DB] migrations 目录不存在: ${migrationsFolder}（首次运行可能未生成）`,
    )
    return
  }
  try {
    migrate(db, { migrationsFolder })
    console.log(`[DB] migrations 已应用: ${migrationsFolder}`)
  } catch (error) {
    console.error('[DB] 应用 migrations 失败:', error)
    throw error
  }
}

/**
 * 初始化数据库（应用启动时调用一次）
 * - 创建 userData 目录（若不存在）
 * - 打开 better-sqlite3 连接
 * - 启用外键 + WAL + synchronous=NORMAL
 * - 应用 migrations
 * - 返回 drizzle 实例
 */
export function initDb(): BetterSQLite3Database<typeof schema> {
  if (dbInstance) {
    console.warn('[DB] 数据库已初始化，返回现有实例')
    return dbInstance
  }

  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = getDbPath()
  console.log(`[DB] 打开数据库: ${dbPath}`)

  rawDb = new Database(dbPath)
  // 启用外键约束（SQLite 默认关闭，必须每次连接手动开启）
  rawDb.pragma('foreign_keys = ON')
  // WAL 模式：写不阻塞读，并发性能更好
  rawDb.pragma('journal_mode = WAL')
  // WAL 下 synchronous=NORMAL 足够安全，性能更好
  rawDb.pragma('synchronous = NORMAL')

  dbInstance = drizzle(rawDb, { schema })

  applyMigrations(dbInstance)

  return dbInstance
}

/**
 * 获取已初始化的数据库实例
 * - 必须先调用 initDb()，否则抛错
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!dbInstance) {
    throw new Error('[DB] 数据库未初始化，请先调用 initDb()')
  }
  return dbInstance
}

/**
 * 关闭数据库连接（应用退出时调用）
 */
export function closeDb(): void {
  if (rawDb) {
    rawDb.close()
    rawDb = null
    dbInstance = null
    console.log('[DB] 数据库连接已关闭')
  }
}

/**
 * 仅供开发调试：列出 migrations 目录中的 SQL 文件
 */
export function listMigrations(): string[] {
  const folder = getMigrationsFolder()
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const content = readFileSync(join(folder, f), 'utf-8')
      return `--- ${f} ---\n${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`
    })
}

export { schema }
