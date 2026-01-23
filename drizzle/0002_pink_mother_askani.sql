CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`magnet_link` text NOT NULL,
	`infohash` text NOT NULL,
	`status` text DEFAULT 'added',
	`progress` real DEFAULT 0,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `downloads_media_infohash_unique` ON `downloads` (`media_id`,`infohash`);--> statement-breakpoint
CREATE INDEX `idx_downloads_media` ON `downloads` (`media_id`);--> statement-breakpoint
CREATE INDEX `idx_downloads_status` ON `downloads` (`status`);--> statement-breakpoint
ALTER TABLE `episodes` ADD `download_id` text;--> statement-breakpoint
CREATE INDEX `idx_episodes_download` ON `episodes` (`download_id`);