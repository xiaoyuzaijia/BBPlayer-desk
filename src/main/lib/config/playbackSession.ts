// 播放会话快照持久化（独立文件，模式同 AppState 的 state.json）
// 路径：app.getPath('userData')/playback-session.json
// 只存 trackIds + 索引 + 进度 + 模式 + 音量；恢复时由 PlaybackFacade 查 DB 组装完整 Track
// （参考 BBPlayer 原生层 GeneralStorage 的 saved_queue 方案）
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PlaybackSessionSnapshot } from '../../../shared/ipc-types'

// 快照结构版本（未来字段变更时用于迁移/丢弃判断）
const SNAPSHOT_VERSION = 1

// 落盘格式：快照本体 + version / savedAt 元信息
interface PersistedSnapshot {
  version: number
  savedAt: number
  trackIds: number[]
  currentIndex: number
  position: number
  playMode: string
  volume: number
}

function getFilePath(): string {
  return join(app.getPath('userData'), 'playback-session.json')
}

/**
 * 读快照：文件不存在 / 解析失败 / version 不符 / 字段非法 → null（log 后静默降级）
 */
export function loadPlaybackSession(): PlaybackSessionSnapshot | null {
  const filePath = getFilePath()
  try {
    if (!existsSync(filePath)) {
      return null
    }
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Partial<PersistedSnapshot>
    if (data.version !== SNAPSHOT_VERSION) {
      console.log(`[PlaybackSession] 快照版本不符（${String(data.version)}），忽略`)
      return null
    }
    // 基本字段校验：trackIds 必须是 number 数组，其余数字字段缺失时给安全默认值
    if (!Array.isArray(data.trackIds) || data.trackIds.some((id) => typeof id !== 'number')) {
      console.warn('[PlaybackSession] 快照 trackIds 非法，忽略')
      return null
    }
    const snapshot: PlaybackSessionSnapshot = {
      trackIds: data.trackIds,
      currentIndex: typeof data.currentIndex === 'number' ? data.currentIndex : 0,
      position: typeof data.position === 'number' ? data.position : 0,
      playMode:
        data.playMode === 'all' || data.playMode === 'one' || data.playMode === 'shuffle'
          ? data.playMode
          : 'all',
      volume: typeof data.volume === 'number' ? data.volume : 80,
    }
    console.log(
      `[PlaybackSession] 快照已加载（曲目数: ${snapshot.trackIds.length}, 索引: ${snapshot.currentIndex}, 进度: ${Math.floor(snapshot.position)}s）`,
    )
    return snapshot
  } catch (error) {
    console.error('[PlaybackSession] 加载快照失败:', error)
    return null
  }
}

/**
 * 写快照：writeFileSync，失败抛错由调用方（facade）包装
 */
export function savePlaybackSession(snapshot: PlaybackSessionSnapshot): void {
  const data: PersistedSnapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    ...snapshot,
  }
  writeFileSync(getFilePath(), JSON.stringify(data, null, 2), 'utf-8')
  console.log(
    `[PlaybackSession] 快照已保存（曲目数: ${snapshot.trackIds.length}, 索引: ${snapshot.currentIndex}）`,
  )
}
