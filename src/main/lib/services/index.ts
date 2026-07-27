// Service 层模块级单例
// 初始化顺序：db → trackService → artistService / playlistService / historyService
// 循环依赖避免：artistService 依赖 trackService（仅用于 formatTrack），不反向引用
import { getDb } from '../db'
import { ArtistService, makeArtistService } from './artistService'
import { HistoryService, makeHistoryService } from './historyService'
import { PlaylistService, makePlaylistService } from './playlistService'
import { TrackService, makeTrackService } from './trackService'

// 延迟初始化：getDb 必须在 initDb() 之后调用
// 此处用对象包装，避免模块加载时立即触发 getDb()
const singletons: {
  track: TrackService | null
  artist: ArtistService | null
  playlist: PlaylistService | null
  history: HistoryService | null
} = {
  track: null,
  artist: null,
  playlist: null,
  history: null,
}

function ensureInit(): void {
  if (singletons.track) return
  const db = getDb()
  singletons.track = makeTrackService(db)
  singletons.artist = makeArtistService(db, singletons.track)
  singletons.playlist = makePlaylistService(db, singletons.track)
  singletons.history = makeHistoryService(db, singletons.track)
}

export function getTrackService(): TrackService {
  ensureInit()
  if (!singletons.track) {
    throw new Error('[Services] trackService 初始化失败')
  }
  return singletons.track
}

export function getArtistService(): ArtistService {
  ensureInit()
  if (!singletons.artist) {
    throw new Error('[Services] artistService 初始化失败')
  }
  return singletons.artist
}

export function getPlaylistService(): PlaylistService {
  ensureInit()
  if (!singletons.playlist) {
    throw new Error('[Services] playlistService 初始化失败')
  }
  return singletons.playlist
}

export function getHistoryService(): HistoryService {
  ensureInit()
  if (!singletons.history) {
    throw new Error('[Services] historyService 初始化失败')
  }
  return singletons.history
}
