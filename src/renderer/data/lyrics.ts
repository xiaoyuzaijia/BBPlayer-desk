// 假数据层：未来接入 API / IndexedDB 时，只改这个文件
// store 层从此处导入，保持 store 极简
// 按 trackId 索引：主歌词（LRC 字符串）+ 可选翻译（LRC 字符串）
//
// 阶段 B：trackId 已从 string 改为 number（与共享 Track 类型对齐）
// 歌词不在本计划范围（见 docs/plan/7-播放收藏夹.md §1 不做的事）
// rawLyrics 暂时清空，所有查询返回 null（UI 显示"暂无歌词"占位）

import type { LyricFile } from '../types/lyric'
import { parseLrc, mergeLyrics } from '../utils/lrcParser'

interface RawLyric {
  main: string         // 主歌词 LRC 字符串
  translation?: string // 翻译 LRC 字符串（可选）
}

// 阶段 B：暂时清空，等歌词计划接入后再填充
const rawLyrics: Record<number, RawLyric> = {}

// 缓存解析结果（同一 trackId 多次访问不重复解析）
const cache = new Map<number, LyricFile>()

// 按 trackId 查询歌词：解析 + 合并翻译 + 缓存
// 找不到时返回 null（让 UI 显示"暂无歌词"占位）
export function getLyricByTrackId(trackId: number): LyricFile | null {
  const cached = cache.get(trackId)
  if (cached) return cached
  const raw = rawLyrics[trackId]
  if (!raw) return null
  const main = parseLrc(raw.main)
  const translation = raw.translation ? parseLrc(raw.translation) : []
  const result = mergeLyrics(main, translation)
  cache.set(trackId, result)
  return result
}
