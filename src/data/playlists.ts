import type { Playlist } from '../types/playlist'
import type { Track } from '../types/track'

// 假数据层：未来接入 API / IndexedDB 时，只改这个文件
// store 层从此处导入，保持 store 极简
// 4 种类型各覆盖：local / synced / favorite / toview

const now = Date.now()
const day = 86400000

function makeTrack(
  id: string,
  title: string,
  artist: string,
  duration: number,
): Track {
  return { id, title, artist, coverUrl: '', duration }
}

export const fakePlaylists: Playlist[] = [
  // ── 完全本地歌单 1：置顶 ──
  {
    id: 'l1',
    title: '我的歌单',
    description: '日常最爱，反复循环。',
    type: 'local',
    isPinned: true,
    createdAt: now - day * 30,
    updatedAt: now - day * 2,
    tracks: [
      makeTrack('l1-t1', '光るなら', 'Goose house', 245),
      makeTrack('l1-t2', 'Only My Railgun', 'fripSide', 268),
      makeTrack('l1-t3', '紅蓮華', 'LiSA', 238),
      makeTrack('l1-t4', '青空のラプソディ', 'fhána', 274),
    ],
  },
  // ── 完全本地歌单 2 ──
  {
    id: 'l2',
    title: '睡前轻音乐',
    description: '安静的夜晚。',
    type: 'local',
    createdAt: now - day * 20,
    updatedAt: now - day * 5,
    tracks: [
      makeTrack('l2-t1', 'River Flows in You', 'Yiruma', 183),
      makeTrack('l2-t2', 'Kiss the Rain', 'Yiruma', 228),
    ],
  },
  // ── 完全本地歌单 3 ──
  {
    id: 'l3',
    title: '跑步专用',
    description: '高 BPM 燃向。',
    type: 'local',
    createdAt: now - day * 10,
    updatedAt: now - day * 1,
    tracks: [
      makeTrack('l3-t1', 'unravel', 'TK from 凛として時雨', 252),
      makeTrack('l3-t2', 'Deceived Masquerade', 'Aimer', 263),
    ],
  },
  // ── 同步型本地歌单：从 B 站收藏夹同步而来 ──
  {
    id: 's1',
    title: 'Vocaloid 精选（已同步）',
    description: '从 B 站收藏夹同步，歌曲列表只读。',
    type: 'synced',
    remoteSyncId: 'b1',
    createdAt: now - day * 15,
    updatedAt: now - day * 3,
    tracks: [
      makeTrack('s1-t1', 'Melt', '初音ミク / ryo', 326),
      makeTrack('s1-t2', 'World is Mine', '初音ミク / ryo', 248),
      makeTrack('s1-t3', 'Tell Your World', '初音ミク / kz', 274),
    ],
  },
  // ── B 站收藏夹 1：远端只读 ──
  {
    id: 'b1',
    title: 'Vocaloid 精选',
    description: 'B 站收藏夹，需登录后同步。',
    type: 'favorite',
    remoteSyncId: 'fav-001',
    createdAt: now - day * 60,
    updatedAt: now - day * 7,
    tracks: [
      makeTrack('b1-t1', 'Melt', '初音ミク / ryo', 326),
      makeTrack('b1-t2', 'World is Mine', '初音ミク / ryo', 248),
      makeTrack('b1-t3', 'Tell Your World', '初音ミク / kz', 274),
      makeTrack('b1-t4', 'ハジメテノオト', '初音ミク / malo', 285),
    ],
  },
  // ── B 站收藏夹 2 ──
  {
    id: 'b2',
    title: '日系燃向合集',
    description: 'B 站收藏夹，需登录后同步。',
    type: 'favorite',
    remoteSyncId: 'fav-002',
    createdAt: now - day * 45,
    updatedAt: now - day * 4,
    tracks: [
      makeTrack('b2-t1', 'Only My Railgun', 'fripSide', 268),
      makeTrack('b2-t2', 'oath sign', 'LiSA', 264),
    ],
  },
  // ── 稍后再看：全局唯一，无 remoteSyncId ──
  {
    id: 'toview',
    title: '稍后再看',
    description: 'B 站稍后再看列表。',
    type: 'toview',
    createdAt: now - day * 90,
    updatedAt: now - day * 1,
    tracks: [
      makeTrack('tv-t1', '夜に駆ける', 'YOASOBI', 259),
      makeTrack('tv-t2', '群青', 'YOASOBI', 235),
    ],
  },
]
