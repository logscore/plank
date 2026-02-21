CREATE TABLE `subtitles` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`episode_id` text,
	`language` text NOT NULL,
	`label` text NOT NULL,
	`source` text NOT NULL,
	`format` text DEFAULT 'vtt',
	`file_path` text,
	`stream_index` integer,
	`is_default` integer DEFAULT false,
	`is_forced` integer DEFAULT false,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_subtitles_media` ON `subtitles` (`media_id`);--> statement-breakpoint
CREATE INDEX `idx_subtitles_episode` ON `subtitles` (`episode_id`);--> statement-breakpoint
ALTER TABLE `episodes` ADD `play_position` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `episodes` ADD `play_duration` real;--> statement-breakpoint
ALTER TABLE `media` ADD `play_position` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `media` ADD `play_duration` real;