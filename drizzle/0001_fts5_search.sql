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
