CREATE TABLE `artists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`signature` text,
	`source` text NOT NULL,
	`remote_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "source_integrity_check" CHECK(
        (source = 'local' AND remote_id IS NULL)
        OR
        (source != 'local' AND remote_id IS NOT NULL)
      )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_remote_id_unq` ON `artists` (`source`,`remote_id`) WHERE source != 'local';--> statement-breakpoint
CREATE UNIQUE INDEX `local_artist_unq` ON `artists` (`name`) WHERE source = 'local';--> statement-breakpoint
CREATE INDEX `artists_name_idx` ON `artists` (`name`);--> statement-breakpoint
CREATE TABLE `bilibili_metadata` (
	`track_id` integer PRIMARY KEY NOT NULL,
	`bvid` text NOT NULL,
	`cid` integer,
	`is_multi_page` integer NOT NULL,
	`main_track_title` text,
	`video_is_valid` integer DEFAULT true NOT NULL,
	`audio_stream_url` text,
	`stream_expires_at` integer,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bilibili_metadata_bvid_cid_idx` ON `bilibili_metadata` (`bvid`,`cid`);--> statement-breakpoint
CREATE TABLE `local_metadata` (
	`track_id` integer PRIMARY KEY NOT NULL,
	`local_path` text NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `play_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`track_id` integer NOT NULL,
	`start_time` integer NOT NULL,
	`duration_played` integer NOT NULL,
	`completed` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `play_history_track_idx` ON `play_history` (`track_id`);--> statement-breakpoint
CREATE INDEX `play_history_start_time_idx` ON `play_history` (`start_time`);--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`playlist_id` integer NOT NULL,
	`track_id` integer NOT NULL,
	`sort_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`playlist_id`, `track_id`),
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_tracks_track_idx` ON `playlist_tracks` (`track_id`);--> statement-breakpoint
CREATE INDEX `playlist_tracks_sort_key_idx` ON `playlist_tracks` (`playlist_id`,`sort_key`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author_id` integer,
	`description` text,
	`cover_url` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`remote_sync_id` integer,
	`last_synced_at` integer,
	`is_pinned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `playlists_title_idx` ON `playlists` (`title`);--> statement-breakpoint
CREATE INDEX `playlists_type_idx` ON `playlists` (`type`);--> statement-breakpoint
CREATE INDEX `playlists_author_idx` ON `playlists` (`author_id`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unique_key` text NOT NULL,
	`title` text NOT NULL,
	`artist_id` integer,
	`cover_url` text,
	`duration` integer,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_unique_key_unique` ON `tracks` (`unique_key`);--> statement-breakpoint
CREATE INDEX `tracks_artist_idx` ON `tracks` (`artist_id`);--> statement-breakpoint
CREATE INDEX `tracks_title_idx` ON `tracks` (`title`);--> statement-breakpoint
CREATE INDEX `tracks_source_idx` ON `tracks` (`source`);