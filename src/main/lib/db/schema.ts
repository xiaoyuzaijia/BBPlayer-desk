// SQLite schema（1:1 复刻 BBPlayer apps/mobile/src/lib/db/schema.ts，去掉共享歌单/dynamic/syncQueue）
// 时间戳统一用 timestamp_ms（毫秒级 unixepoch，返回 JS Date），与 BBPlayer 一致
import { relations, sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// 艺术家表（反归一化，source + remoteId 唯一）
export const artists = sqliteTable(
  'artists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    signature: text('signature'),
    source: text('source', { enum: ['bilibili', 'local'] }).notNull(),
    remoteId: text('remote_id'), // bilibili mid
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('source_remote_id_unq')
      .on(table.source, table.remoteId)
      .where(sql`source != 'local'`),
    uniqueIndex('local_artist_unq')
      .on(table.name)
      .where(sql`source = 'local'`),
    index('artists_name_idx').on(table.name),
    check(
      'source_integrity_check',
      sql`
        (source = 'local' AND remote_id IS NULL)
        OR
        (source != 'local' AND remote_id IS NOT NULL)
      `,
    ),
  ],
)

// 曲目池（全局共享，跨歌单复用，uniqueKey 唯一）
export const tracks = sqliteTable(
  'tracks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uniqueKey: text('unique_key').unique().notNull(),
    title: text('title').notNull(),
    artistId: integer('artist_id').references(() => artists.id, {
      onDelete: 'set null',
    }),
    coverUrl: text('cover_url'),
    duration: integer('duration'),
    source: text('source', { enum: ['bilibili', 'local'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('tracks_artist_idx').on(table.artistId),
    index('tracks_title_idx').on(table.title),
    index('tracks_source_idx').on(table.source),
  ],
)

// 歌单表（type 决定业务分支：local 可增删，其余远程同步只读）
export const playlists = sqliteTable(
  'playlists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    authorId: integer('author_id').references(() => artists.id, {
      onDelete: 'set null',
    }),
    description: text('description'),
    coverUrl: text('cover_url'),
    itemCount: integer('item_count').notNull().default(0),
    type: text('type', {
      enum: ['favorite', 'collection', 'multi_page', 'local'],
    }).notNull(),
    remoteSyncId: integer('remote_sync_id'), // B 站收藏夹/合集/多 P av 号
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('playlists_title_idx').on(table.title),
    index('playlists_type_idx').on(table.type),
    index('playlists_author_idx').on(table.authorId),
  ],
)

// 歌单-曲目关系表（fractional indexing 排序，sortKey 越大越靠前，查询用 DESC）
export const playlistTracks = sqliteTable(
  'playlist_tracks',
  {
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    sortKey: text('sort_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.playlistId, table.trackId] }),
    index('playlist_tracks_track_idx').on(table.trackId),
    index('playlist_tracks_sort_key_idx').on(table.playlistId, table.sortKey),
  ],
)

// B 站元数据（含音频流 URL 缓存）
export const bilibiliMetadata = sqliteTable(
  'bilibili_metadata',
  {
    trackId: integer('track_id')
      .primaryKey()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    bvid: text('bvid').notNull(),
    cid: integer('cid'),
    isMultiPage: integer('is_multi_page', { mode: 'boolean' }).notNull(),
    mainTrackTitle: text('main_track_title'), // 分 P 视频的主标题
    videoIsValid: integer('video_is_valid', { mode: 'boolean' })
      .notNull()
      .default(true),
    audioStreamUrl: text('audio_stream_url'), // 缓存的音频流 URL
    streamExpiresAt: integer('stream_expires_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('bilibili_metadata_bvid_cid_idx').on(table.bvid, table.cid)],
)

// 本地文件元数据
export const localMetadata = sqliteTable('local_metadata', {
  trackId: integer('track_id')
    .primaryKey()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  localPath: text('local_path').notNull(),
})

// 播放历史
export const playHistory = sqliteTable(
  'play_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    startTime: integer('start_time').notNull(), // 播放开始时间戳 ms
    durationPlayed: integer('duration_played').notNull(), // 实际播放秒数
    completed: integer('completed', { mode: 'boolean' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index('play_history_track_idx').on(table.trackId),
    index('play_history_start_time_idx').on(table.startTime),
  ],
)

// ##################################
// RELATIONS
// ##################################
export const artistRelations = relations(artists, ({ many }) => ({
  tracks: many(tracks),
  authoredPlaylists: many(playlists),
}))

export const trackRelations = relations(tracks, ({ one, many }) => ({
  artist: one(artists, {
    fields: [tracks.artistId],
    references: [artists.id],
  }),
  playlistLinks: many(playlistTracks),
  bilibiliMetadata: one(bilibiliMetadata, {
    fields: [tracks.id],
    references: [bilibiliMetadata.trackId],
  }),
  localMetadata: one(localMetadata, {
    fields: [tracks.id],
    references: [localMetadata.trackId],
  }),
  playHistory: many(playHistory),
}))

export const playlistRelations = relations(playlists, ({ one, many }) => ({
  author: one(artists, {
    fields: [playlists.authorId],
    references: [artists.id],
  }),
  trackLinks: many(playlistTracks),
}))

export const playlistTrackRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, {
    fields: [playlistTracks.trackId],
    references: [tracks.id],
  }),
}))

export const bilibiliMetadataRelations = relations(
  bilibiliMetadata,
  ({ one }) => ({
    track: one(tracks, {
      fields: [bilibiliMetadata.trackId],
      references: [tracks.id],
    }),
  }),
)

export const localMetadataRelations = relations(localMetadata, ({ one }) => ({
  track: one(tracks, {
    fields: [localMetadata.trackId],
    references: [tracks.id],
  }),
}))

export const playHistoryRelations = relations(playHistory, ({ one }) => ({
  track: one(tracks, {
    fields: [playHistory.trackId],
    references: [tracks.id],
  }),
}))
