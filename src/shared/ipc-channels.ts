// IPC 通道名常量（AGENTS.md 禁止字符串硬编码）
// 格式：<module>:<action>

export const AUTH_CHANNELS = {
  loginWithQrCode: 'auth:loginWithQrCode',
  cancelQrLogin: 'auth:cancelQrLogin',
  logout: 'auth:logout',
  getUserInfo: 'auth:getUserInfo',
  qrStatus: 'auth:qrStatus', // 主→渲染 推送
  stateChanged: 'auth:stateChanged', // 主→渲染 推送
} as const

export const IMAGE_CHANNELS = {
  getProxyPort: 'image:getProxyPort',
} as const

export const PLAYLIST_CHANNELS = {
  getAll: 'playlist:getAll',
  getById: 'playlist:getById',
  getTracks: 'playlist:getTracks',
  getTracksPaginated: 'playlist:getTracksPaginated',
  createLocal: 'playlist:createLocal',
  updateMetadata: 'playlist:updateMetadata',
  delete: 'playlist:delete',
  addTracks: 'playlist:addTracks',
  removeTracks: 'playlist:removeTracks',
  reorderTrack: 'playlist:reorderTrack',
  syncRemote: 'playlist:syncRemote',
  syncProgress: 'playlist:syncProgress', // 主→渲染 推送
} as const

export const PLAYBACK_CHANNELS = {
  getAudioUrl: 'playback:getAudioUrl',
  refreshAudioUrl: 'playback:refreshAudioUrl',
} as const

export const HISTORY_CHANNELS = {
  record: 'history:record',
  getRecent: 'history:getRecent',
} as const

export const BILIBILI_CHANNELS = {
  getFavoritePlaylists: 'bilibili:getFavoritePlaylists',
  getFavoriteListContents: 'bilibili:getFavoriteListContents',
  addTrackByBvid: 'bilibili:addTrackByBvid', // 远端收藏夹点击播放时按 bvid 入库
} as const

export const LYRIC_CHANNELS = {
  getLyrics: 'lyric:getLyrics', // 按 trackId 获取歌词（缓存 + 网络竞速）
  clearAllLyrics: 'lyric:clearAllLyrics', // 清空所有歌词缓存
} as const
