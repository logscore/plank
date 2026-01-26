CREATE TABLE `configuration` (
	`id` text PRIMARY KEY NOT NULL,
	`tmdb_api_key` text,
	`tmdb_language` text DEFAULT 'en-US',
	`jackett_url` text,
	`jackett_api_key` text,
	`jackett_trusted_groups` text,
	`jackett_min_seeders` integer DEFAULT 5,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
