import type { LyricLine, LyricFile } from '../types/lyric'

// ── LRC 解析工具 ──
// 支持标准 LRC 格式：[mm:ss.xx]text
// 支持多时间戳行：[mm:ss.xx][mm:ss.xx]text（同一句歌词对应多个时间点）
// 元数据行（[ti:...] [ar:...] [al:...] [by:...] 等）会被自动跳过

// 时间戳正则：匹配 [mm:ss.xx] 或 [mm:ss.xxx]
// 分组 1=分钟，2=秒，3=毫秒（2-3 位）
const TIME_TAG_RE = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g

// 元数据行正则：[ti:xxx] [ar:xxx] [al:xxx] [by:xxx] [offset:xxx] 等
const META_RE = /^\[(ti|ar|al|by|offset|length|re|ve):/i

// 把 [mm:ss.xx] 时间戳转换为秒（保留 0.01s 精度）
function tagToSeconds(min: string, sec: string, ms: string): number {
  const minutes = parseInt(min, 10)
  const seconds = parseInt(sec, 10)
  // 毫秒补齐到 3 位后除以 1000，避免 [00:01.50] 被解析成 0.15s
  const msPadded = ms.length === 2 ? ms + '0' : ms
  const milliseconds = parseInt(msPadded, 10)
  return minutes * 60 + seconds + milliseconds / 1000
}

// 解析单条 LRC 字符串 → LyricLine[]
// 一行可含多个时间戳前缀，每个时间戳生成一条独立 LyricLine
// 无效行（无时间戳或纯元数据）跳过
// 返回结果按 time 升序排序
export function parseLrc(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = []

  for (const rawLine of lrcText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    // 跳过元数据行
    if (META_RE.test(line)) continue

    // 收集行内所有时间戳 + 最后一个时间戳的位置（用于截取歌词文本）
    const times: number[] = []
    let lastEnd = 0
    for (const match of line.matchAll(TIME_TAG_RE)) {
      times.push(tagToSeconds(match[1], match[2], match[3]))
      lastEnd = (match.index ?? 0) + match[0].length
    }

    if (times.length === 0) continue

    // 截取最后一个时间戳后的文本作为歌词内容
    // 例如 [00:01.00][00:05.00]Hello → "Hello"
    const text = line.slice(lastEnd).trim()

    // 每个时间戳生成一条 LyricLine
    for (const time of times) {
      lines.push({ time, text })
    }
  }

  // 按 time 升序排序（稳定排序）
  lines.sort((a, b) => a.time - b.time)
  return lines
}

// 合并主歌词 + 翻译歌词：按相同 time（精确到 0.01s）匹配
// 翻译中存在但主歌词中不存在的行：丢弃（保证主歌词为主线）
// 返回新的 LyricFile（hasTranslation = translationLines.length > 0）
export function mergeLyrics(main: LyricLine[], translation: LyricLine[]): LyricFile {
  // 用 Map 加速翻译查询：key = time 四舍五入到 0.01s（避免浮点误差）
  const transMap = new Map<number, string>()
  for (const t of translation) {
    transMap.set(Math.round(t.time * 100), t.text)
  }

  const mergedLines: LyricLine[] = main.map((line) => {
    const key = Math.round(line.time * 100)
    const translationText = transMap.get(key)
    return translationText ? { ...line, translation: translationText } : { ...line }
  })

  return {
    lines: mergedLines,
    hasTranslation: translation.length > 0,
  }
}
