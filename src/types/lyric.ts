// 歌词类型：所有 store / 组件共享的歌词数据结构
// 字段对齐 BBPlayer 调研报告中的方案 A（主歌词 + 翻译合并）

// 单行歌词：时间戳（秒）+ 主歌词 + 可选翻译
export interface LyricLine {
  time: number       // 秒
  text: string       // 主歌词（空字符串表示纯音乐段）
  translation?: string  // 翻译（可选，由 mergeLyrics 合并而来）
}

// 整首歌的歌词文件解析结果
export interface LyricFile {
  lines: LyricLine[]
  hasTranslation: boolean  // 是否含翻译（用于 UI 决策）
}
