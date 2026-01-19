-- Add TMDB metadata columns to movies table
ALTER TABLE movies ADD COLUMN runtime INTEGER;
--> statement-breakpoint
ALTER TABLE movies ADD COLUMN genres TEXT;
--> statement-breakpoint
ALTER TABLE movies ADD COLUMN original_language TEXT;
--> statement-breakpoint
ALTER TABLE movies ADD COLUMN certification TEXT;
