CREATE TABLE `torrent_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`imdb_id` text NOT NULL,
	`tmdb_id` integer,
	`magnet_link` text NOT NULL,
	`infohash` text NOT NULL,
	`title` text NOT NULL,
	`quality` text,
	`release_group` text,
	`size` integer,
	`seeders` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `torrent_cache_imdb_id_unique` ON `torrent_cache` (`imdb_id`);--> statement-breakpoint
CREATE INDEX `idx_torrent_cache_imdb` ON `torrent_cache` (`imdb_id`);--> statement-breakpoint
CREATE INDEX `idx_torrent_cache_tmdb` ON `torrent_cache` (`tmdb_id`);