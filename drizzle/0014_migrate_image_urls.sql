UPDATE `user`
SET `image` = CONCAT('/api', `image`)
WHERE `image` LIKE '/images/%';--> statement-breakpoint
UPDATE `organization`
SET `logo` = CONCAT('/api', `logo`)
UPDATE `media`
SET `poster_url` = CONCAT('/api', `poster_url`)
WHERE `poster_url` LIKE '/images/%';--> statement-breakpoint
UPDATE `media`
SET `backdrop_url` = CONCAT('/api', `backdrop_url`)
WHERE `backdrop_url` LIKE '/images/%';
