DROP INDEX `media_user_infohash_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_organization_infohash_unique` ON `media` (`organization_id`,`infohash`);