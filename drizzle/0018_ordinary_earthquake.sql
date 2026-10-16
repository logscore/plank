DROP INDEX `idx_downloads_media`;--> statement-breakpoint
DROP INDEX `organization_slug_uidx`;--> statement-breakpoint
DROP INDEX `idx_seasons_media`;--> statement-breakpoint
ALTER TABLE `seasons` DROP COLUMN `overview`;--> statement-breakpoint
ALTER TABLE `seasons` DROP COLUMN `poster_path`;--> statement-breakpoint
ALTER TABLE `seasons` DROP COLUMN `air_date`;--> statement-breakpoint
ALTER TABLE `seasons` DROP COLUMN `created_at`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_torrent_cache` (
	`imdb_id` text PRIMARY KEY NOT NULL,
	`magnet_link` text NOT NULL,
	`infohash` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_torrent_cache`("imdb_id", "magnet_link", "infohash") SELECT "imdb_id", "magnet_link", "infohash" FROM `torrent_cache`;--> statement-breakpoint
DROP TABLE IF EXISTS `torrent_cache`;--> statement-breakpoint
DROP TABLE IF EXISTS `media_fts`;--> statement-breakpoint
ALTER TABLE `__new_torrent_cache` RENAME TO `torrent_cache`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `configuration` DROP COLUMN `tmdb_language`;--> statement-breakpoint
ALTER TABLE `configuration` DROP COLUMN `updated_at`;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `created_at`;
