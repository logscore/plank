DROP TABLE `episodes`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subtitles` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`language` text NOT NULL,
	`label` text NOT NULL,
	`source` text NOT NULL,
	`format` text DEFAULT 'vtt',
	`file_path` text,
	`stream_index` integer,
	`is_default` integer DEFAULT false,
	`is_forced` integer DEFAULT false,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_subtitles`("id", "media_id", "language", "label", "source", "format", "file_path", "stream_index", "is_default", "is_forced", "created_at") SELECT "id", "media_id", "language", "label", "source", "format", "file_path", "stream_index", "is_default", "is_forced", "created_at" FROM `subtitles`;--> statement-breakpoint
DROP TABLE `subtitles`;--> statement-breakpoint
ALTER TABLE `__new_subtitles` RENAME TO `subtitles`;--> statement-breakpoint
CREATE INDEX `idx_subtitles_media` ON `subtitles` (`media_id`);--> statement-breakpoint
CREATE TABLE `__new_media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`type` text DEFAULT 'movie' NOT NULL,
	`title` text NOT NULL,
	`overview` text,
	`year` integer,
	`tmdb_id` integer,
	`imdb_id` text,
	`runtime` integer,
	`original_language` text,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`poster_url` text,
	`backdrop_url` text,
	`genres` text,
	`certification` text,
	`total_seasons` integer,
	`parent_id` text,
	`season_id` text,
	`episode_number` integer,
	`season_number` integer,
	`display_order` integer,
	`still_path` text,
	`air_date` text,
	`magnet_link` text,
	`infohash` text,
	`status` text DEFAULT 'pending',
	`progress` real DEFAULT 0,
	`file_path` text,
	`file_size` integer,
	`file_index` integer,
	`downloaded_bytes` integer DEFAULT 0,
	`last_played_at` integer,
	`play_position` real DEFAULT 0,
	`play_duration` real,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_media`("id", "user_id", "organization_id", "type", "title", "overview", "year", "tmdb_id", "imdb_id", "runtime", "original_language", "added_at", "created_at", "poster_url", "backdrop_url", "genres", "certification", "total_seasons", "parent_id", "season_id", "episode_number", "season_number", "display_order", "still_path", "air_date", "magnet_link", "infohash", "status", "progress", "file_path", "file_size", "file_index", "downloaded_bytes", "last_played_at", "play_position", "play_duration") SELECT "id", "user_id", "organization_id", "type", "title", "overview", "year", "tmdb_id", NULL AS "imdb_id", "runtime", "original_language", "added_at", "added_at" AS "created_at", "poster_url", "backdrop_url", "genres", "certification", "total_seasons", NULL AS "parent_id", NULL AS "season_id", NULL AS "episode_number", NULL AS "season_number", NULL AS "display_order", NULL AS "still_path", NULL AS "air_date", "magnet_link", "infohash", CASE WHEN "status" = 'added' THEN 'pending' ELSE COALESCE("status", 'pending') END AS "status", COALESCE("progress", 0) AS "progress", "file_path", "file_size", NULL AS "file_index", 0 AS "downloaded_bytes", "last_played_at", COALESCE("play_position", 0) AS "play_position", "play_duration" FROM `media`;--> statement-breakpoint
DROP TABLE `media`;--> statement-breakpoint
ALTER TABLE `__new_media` RENAME TO `media`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `media_organization_infohash_unique` ON `media` (`organization_id`,`infohash`) WHERE "media"."infohash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_media_user` ON `media` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_media_status` ON `media` (`status`) WHERE "media"."status" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_media_library` ON `media` (`organization_id`,`type`) WHERE "media"."type" IN ('movie', 'show');--> statement-breakpoint
CREATE INDEX `idx_media_episodes` ON `media` (`parent_id`,`season_id`,`display_order`) WHERE "media"."type" = 'episode';--> statement-breakpoint
CREATE INDEX `idx_media_organization` ON `media` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_media_watching` ON `media` (`organization_id`,`last_played_at`) WHERE "media"."play_position" > 0;