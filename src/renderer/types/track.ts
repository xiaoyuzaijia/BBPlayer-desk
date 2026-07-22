// 曲目类型：所有 store 共享的曲目数据结构
// 字段对齐 BBPlayer 的 Track（精简版，未来接入 DB 时再扩展）
export interface Track {
  id: string
  title: string
  artist: string
  coverUrl: string
  duration: number
}
