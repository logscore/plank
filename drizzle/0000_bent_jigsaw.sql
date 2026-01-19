CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `movies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
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
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_played_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_user_infohash_unique` ON `movies` (`user_id`,`infohash`);--> statement-breakpoint
CREATE INDEX `idx_movies_user` ON `movies` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_movies_status` ON `movies` (`status`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint


-- FTS5 Virtual Table for Movie Search
CREATE VIRTUAL TABLE IF NOT EXISTS movies_fts USING fts5(
  title,
  year UNINDEXED,
  movie_id UNINDEXED,
  user_id UNINDEXED,
  tokenize = 'unicode61'
);
--> statement-breakpoint

-- Sync triggers
CREATE TRIGGER IF NOT EXISTS movies_ai AFTER INSERT ON movies BEGIN
  INSERT INTO movies_fts(title, year, movie_id, user_id) 
  VALUES (new.title, new.year, new.id, new.user_id);
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS movies_ad AFTER DELETE ON movies BEGIN
  DELETE FROM movies_fts WHERE movie_id = old.id;
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS movies_au AFTER UPDATE OF title, year ON movies BEGIN
  UPDATE movies_fts SET title = new.title, year = new.year 
  WHERE movie_id = old.id;
END;
--> statement-breakpoint

-- Backfill existing data
INSERT INTO movies_fts(title, year, movie_id, user_id) 
SELECT title, year, id, user_id FROM movies
WHERE NOT EXISTS (SELECT 1 FROM movies_fts WHERE movie_id = movies.id);
