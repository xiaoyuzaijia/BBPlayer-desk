// LyricService（单表 CRUD：文件系统版，无 DB）
// 1:1 复刻 BBPlayer apps/mobile/src/lib/services/lyricService.ts 中的文件读写部分
// 与 BBPlayer 的差异：
// - BBPlayer 把编排（smartFetchLyrics/getBestMatchedLyrics）和文件读写放一个 service
// - 本项目按 AGENTS.md 四层架构，编排放 facade（LyricFacade），本 service 只做文件 CRUD
// - 持久化用 Node fs/promises 替代 expo-file-system
//
// 不需要 withDB / *Sync 变体（无 DB 事务）
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Result, ResultAsync, err, ok } from 'neverthrow'

import { app } from 'electron'
import { ServiceError } from '../errors'
import { createServiceError } from '../errors/service'

/**
 * 渲染进程的 LyricFileData 通过 IPC 传到主进程；为避免循环依赖，
 * 这里定义等价的内部结构（与 src/renderer/types/lyric.ts 的 LyricFileData 字段一致）。
 * 跨 IPC 时 Date 无差异（都是 number）。
 */
export interface LyricFileData {
	id: string
	updateTime: number
	lrc?: string
	tlyric?: string
	romalrc?: string
	errorMessage?: string
}

/**
 * uniqueKey 形如 `bilibili::BV1xxx`，含 `::` 在文件系统路径中不安全
 * BBPlayer 用 `replaceAll('::', '--')`，本项目保持一致
 */
function safeFileName(uniqueKey: string): string {
	return uniqueKey.replaceAll('::', '--')
}

export class LyricService {
	private readonly lyricsDir: string

	constructor(userDataDir: string) {
		this.lyricsDir = path.join(userDataDir, 'lyrics')
	}

	/**
	 * 确保歌词目录存在（应用启动时调用一次即可）
	 * recursive: true 使得即使父目录不存在也能创建
	 */
	async ensureDir(): Promise<Result<true, ServiceError>> {
		try {
			await fs.mkdir(this.lyricsDir, { recursive: true })
			return ok(true)
		} catch (e) {
			return err(
				createServiceError('Validation', `创建歌词目录失败: ${this.lyricsDir}`, {
					cause: e,
				}),
			)
		}
	}

	/**
	 * 读歌词文件
	 * @param uniqueKey 曲目唯一 ID（track.uniqueKey）
	 * @returns 文件不存在 / JSON 解析失败 / 无 lrc 且无 errorMessage 时返回 null（cache miss）
	 *
	 * 文件不存在和解析失败都视为 cache miss 而非错误（与 BBPlayer 一致），
	 * 避免一首损坏的歌词文件阻塞后续流程
	 */
	getLyricFile(
		uniqueKey: string,
	): ResultAsync<LyricFileData | null, ServiceError> {
		const filePath = path.join(this.lyricsDir, `${safeFileName(uniqueKey)}.json`)
		// 用 ResultAsync.fromPromise + 显式 async 函数，内部 try/catch 区分错误类型
		return ResultAsync.fromPromise(
			(async () => {
				const content = await fs.readFile(filePath, 'utf-8')
				const data = JSON.parse(content) as LyricFileData
				// JSON 解析成功但无 lrc 且无 errorMessage 算 cache miss
				// errorMessage 有值时仍返回数据，让 facade 直接展示错误避免重试
				if (!data.lrc && !data.errorMessage) {
					return null
				}
				return data
			})(),
			// 文件不存在（ENOENT）或 JSON 解析失败都视为 cache miss
			// 这里返回 null 而非 ServiceError，但 neverthrow 的错误类型不能是 null，
			// 所以用 ServiceError 占位，外层 orElse 转成 null
			() => createServiceError('Validation', 'CACHE_MISS'),
		).orElse(() => ok<LyricFileData | null, ServiceError>(null))
	}

	/**
	 * 写歌词文件
	 * @param data 歌词数据（id / updateTime 由 facade 填充）
	 * @param uniqueKey 曲目唯一 ID
	 */
	saveLyricFile(
		data: LyricFileData,
		uniqueKey: string,
	): ResultAsync<LyricFileData, ServiceError> {
		const filePath = path.join(this.lyricsDir, `${safeFileName(uniqueKey)}.json`)
		return ResultAsync.fromPromise(
			fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8').then(
				() => data,
			),
			(e) =>
				createServiceError('Validation', '歌词文件写入失败', {
					data: { filePath },
					cause: e,
				}),
		)
	}

	/**
	 * 清空所有歌词缓存（设置页"清除缓存"用）
	 * 删除整个 lyrics 目录，下次 ensureDir 时重建
	 */
	async clearAllLyrics(): Promise<Result<true, ServiceError>> {
		try {
			await fs.rm(this.lyricsDir, { recursive: true, force: true })
			return ok(true)
		} catch (e) {
			return err(
				createServiceError('Validation', '清空歌词目录失败', {
					data: { dir: this.lyricsDir },
					cause: e,
				}),
			)
		}
	}
}

/**
 * 工厂函数：从 app.getPath('userData') 创建 LyricService
 * 注意：必须在 Electron app ready 之后调用（否则 app.getPath 会抛错）
 */
export function makeLyricService(): LyricService {
	return new LyricService(app.getPath('userData'))
}
