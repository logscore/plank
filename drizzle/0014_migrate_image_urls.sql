UPDATE `user`
SET `image` = '/api' || `image`
WHERE `image` LIKE '/images/%';--> statement-breakpoint
UPDATE `organization`
SET `logo` = '/api' || `logo`
WHERE `logo` LIKE '/images/%';--> statement-breakpoint
UPDATE `media`
SET `poster_url` = '/api' || `poster_url`
WHERE `poster_url` LIKE '/images/%';--> statement-breakpoint
UPDATE `media`
SET `backdrop_url` = '/api' || `backdrop_url`
WHERE `backdrop_url` LIKE '/images/%';
