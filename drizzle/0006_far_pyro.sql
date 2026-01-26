ALTER TABLE `configuration` RENAME COLUMN "jackett_url" TO "prowlarr_url";--> statement-breakpoint
ALTER TABLE `configuration` RENAME COLUMN "jackett_api_key" TO "prowlarr_api_key";--> statement-breakpoint
ALTER TABLE `configuration` RENAME COLUMN "jackett_trusted_groups" TO "prowlarr_trusted_groups";--> statement-breakpoint
ALTER TABLE `configuration` RENAME COLUMN "jackett_min_seeders" TO "prowlarr_min_seeders";