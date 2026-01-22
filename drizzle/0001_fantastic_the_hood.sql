CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`episode_number` integer NOT NULL,
	`title` text,
	`overview` text,
	`still_path` text,
	`runtime` integer,
	`air_date` text,
	`file_index` integer,
	`file_path` text,
	`file_size` integer,
	`downloaded_bytes` integer DEFAULT 0,
	`display_order` integer NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_season_number_unique` ON `episodes` (`season_id`,`episode_number`);--> statement-breakpoint
CREATE INDEX `idx_episodes_season` ON `episodes` (`season_id`);--> statement-breakpoint
CREATE INDEX `idx_episodes_status` ON `episodes` (`status`);--> statement-breakpoint
CREATE INDEX `idx_episodes_display_order` ON `episodes` (`season_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'movie' NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`poster_url` text,
	`backdrop_url` text,
	`overview` text,
	`magnet_link` text NOT NULL,
	`infohash` text NOT NULL,
	`file_path` text,
	`file_size` integer,
	`status` text DEFAULT 'added',
	`progress` real DEFAULT 0,
	`tmdb_id` integer,
	`runtime` integer,
	`genres` text,
	`original_language` text,
	`certification` text,
	`total_seasons` integer,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_played_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_user_infohash_unique` ON `media` (`user_id`,`infohash`);--> statement-breakpoint
CREATE INDEX `idx_media_user` ON `media` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_media_status` ON `media` (`status`);--> statement-breakpoint
CREATE INDEX `idx_media_type` ON `media` (`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`name` text,
	`overview` text,
	`poster_path` text,
	`air_date` text,
	`episode_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_media_number_unique` ON `seasons` (`media_id`,`season_number`);--> statement-breakpoint
CREATE INDEX `idx_seasons_media` ON `seasons` (`media_id`);--> statement-breakpoint
-- Migrate data from movies to media before dropping
INSERT INTO `media` (
  `id`, `user_id`, `type`, `title`, `year`, `poster_url`, `backdrop_url`, `overview`,
  `magnet_link`, `infohash`, `file_path`, `file_size`, `status`, `progress`,
  `tmdb_id`, `runtime`, `genres`, `original_language`, `certification`, `added_at`, `last_played_at`
)
SELECT 
  `id`, `user_id`, 'movie', `title`, `year`, `poster_url`, `backdrop_url`, `overview`,
  `magnet_link`, `infohash`, `file_path`, `file_size`, `status`, `progress`,
  `tmdb_id`, `runtime`, `genres`, `original_language`, `certification`, `added_at`, `last_played_at`
FROM `movies`;
--> statement-breakpoint
-- Drop old FTS triggers
DROP TRIGGER IF EXISTS movies_fts_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS movies_fts_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS movies_fts_delete;
--> statement-breakpoint
DROP TABLE `movies`;
--> statement-breakpoint
DROP TABLE IF EXISTS `movies_fts`;
--> statement-breakpoint
-- Create FTS table for media
CREATE VIRTUAL TABLE IF NOT EXISTS `media_fts` USING fts5(
  title,
  overview,
  content=media,
  content_rowid=rowid
);
--> statement-breakpoint
-- Populate media_fts from media table
INSERT INTO media_fts(rowid, title, overview)
SELECT rowid, title, overview FROM media;
--> statement-breakpoint
-- Create triggers for media FTS
CREATE TRIGGER media_fts_insert AFTER INSERT ON media BEGIN
  INSERT INTO media_fts(rowid, title, overview) VALUES (NEW.rowid, NEW.title, NEW.overview);
END;
--> statement-breakpoint
CREATE TRIGGER media_fts_update AFTER UPDATE ON media BEGIN
  UPDATE media_fts SET title = NEW.title, overview = NEW.overview WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER media_fts_delete AFTER DELETE ON media BEGIN
  DELETE FROM media_fts WHERE rowid = OLD.rowid;
END;