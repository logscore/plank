import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc } from 'drizzle-orm';
import * as schema from '../lib/server/db/schema';

// Create a fresh test database for each test file
const testDb = new Database(':memory:');
testDb.pragma('journal_mode = WAL');
const db = drizzle(testDb, { schema });

// Helper to create tables
function createTables() {
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER DEFAULT 0 NOT NULL,
      image TEXT,
      created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      updated_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      year INTEGER,
      poster_url TEXT,
      backdrop_url TEXT,
      overview TEXT,
      magnet_link TEXT NOT NULL,
      infohash TEXT NOT NULL,
      file_path TEXT,
      file_size INTEGER,
      status TEXT DEFAULT 'added',
      progress REAL DEFAULT 0,
      tmdb_id INTEGER,
      added_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      last_played_at INTEGER,
      UNIQUE(user_id, infohash)
    );

    CREATE INDEX IF NOT EXISTS idx_movies_user ON movies(user_id);
    CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
  `);
}

// Movies module that mirrors the real implementation
const movies = {
  list(userId: string) {
    return db
      .select()
      .from(schema.movies)
      .where(eq(schema.movies.userId, userId))
      .orderBy(desc(schema.movies.addedAt))
      .all();
  },

  get(id: string, userId: string) {
    return db
      .select()
      .from(schema.movies)
      .where(and(eq(schema.movies.id, id), eq(schema.movies.userId, userId)))
      .get();
  },

  create(movie: {
    userId: string;
    title: string;
    year?: number | null;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    overview?: string | null;
    magnetLink: string;
    infohash: string;
    tmdbId?: number | null;
  }) {
    const id = crypto.randomUUID();
    const now = new Date();

    const newMovie = {
      id,
      userId: movie.userId,
      title: movie.title,
      year: movie.year ?? null,
      posterUrl: movie.posterUrl ?? null,
      backdropUrl: movie.backdropUrl ?? null,
      overview: movie.overview ?? null,
      magnetLink: movie.magnetLink,
      infohash: movie.infohash,
      tmdbId: movie.tmdbId ?? null,
      status: 'added' as const,
      progress: 0,
      addedAt: now,
      filePath: null,
      fileSize: null,
      lastPlayedAt: null,
    };

    db.insert(schema.movies).values(newMovie).run();

    return newMovie;
  },

  updateProgress(id: string, progress: number, status: 'added' | 'downloading' | 'complete') {
    db.update(schema.movies)
      .set({ progress, status })
      .where(eq(schema.movies.id, id))
      .run();
  },

  updateFilePath(id: string, filePath: string) {
    db.update(schema.movies)
      .set({ filePath, status: 'complete' })
      .where(eq(schema.movies.id, id))
      .run();
  },

  delete(id: string, userId: string) {
    db.delete(schema.movies)
      .where(and(eq(schema.movies.id, id), eq(schema.movies.userId, userId)))
      .run();
  },

  updateLastPlayed(id: string) {
    db.update(schema.movies)
      .set({ lastPlayedAt: new Date() })
      .where(eq(schema.movies.id, id))
      .run();
  },
};

// Test user fixture
const testUser = {
  id: 'test-user-id-123',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testUser2 = {
  id: 'test-user-id-456',
  name: 'Other User',
  email: 'other@example.com',
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Sample magnet link for testing
const sampleMagnet = 'magnet:?xt=urn:btih:abc123def456&dn=Test+Movie+2024';
const sampleInfohash = 'abc123def456';

describe('Database Module - Movies', () => {
  beforeAll(() => {
    createTables();
  });

  beforeEach(() => {
    // Clear tables
    testDb.exec('DELETE FROM movies');
    testDb.exec('DELETE FROM user');

    // Insert test users
    db.insert(schema.user).values(testUser).run();
    db.insert(schema.user).values(testUser2).run();
  });

  describe('movies.create', () => {
    it('should create a movie with all required fields', () => {
      const movie = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      expect(movie).toBeDefined();
      expect(movie.id).toBeDefined();
      expect(movie.title).toBe('Test Movie');
      expect(movie.userId).toBe(testUser.id);
      expect(movie.magnetLink).toBe(sampleMagnet);
      expect(movie.infohash).toBe(sampleInfohash);
      expect(movie.status).toBe('added');
      expect(movie.progress).toBe(0);
    });

    it('should create a movie with optional metadata', () => {
      const movie = movies.create({
        userId: testUser.id,
        title: 'Test Movie with Metadata',
        year: 2024,
        posterUrl: 'https://example.com/poster.jpg',
        backdropUrl: 'https://example.com/backdrop.jpg',
        overview: 'This is a test movie overview.',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
        tmdbId: 12345,
      });

      expect(movie.year).toBe(2024);
      expect(movie.posterUrl).toBe('https://example.com/poster.jpg');
      expect(movie.backdropUrl).toBe('https://example.com/backdrop.jpg');
      expect(movie.overview).toBe('This is a test movie overview.');
      expect(movie.tmdbId).toBe(12345);
    });

    it('should generate unique IDs for each movie', () => {
      const movie1 = movies.create({
        userId: testUser.id,
        title: 'Movie 1',
        magnetLink: 'magnet:?xt=urn:btih:111',
        infohash: '111',
      });

      const movie2 = movies.create({
        userId: testUser.id,
        title: 'Movie 2',
        magnetLink: 'magnet:?xt=urn:btih:222',
        infohash: '222',
      });

      expect(movie1.id).not.toBe(movie2.id);
    });

    it('should enforce unique constraint on userId + infohash', () => {
      movies.create({
        userId: testUser.id,
        title: 'Movie 1',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      expect(() => {
        movies.create({
          userId: testUser.id,
          title: 'Duplicate Movie',
          magnetLink: sampleMagnet,
          infohash: sampleInfohash,
        });
      }).toThrow();
    });

    it('should allow same infohash for different users', () => {
      const movie1 = movies.create({
        userId: testUser.id,
        title: 'Movie for User 1',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      const movie2 = movies.create({
        userId: testUser2.id,
        title: 'Same Movie for User 2',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      expect(movie1.id).not.toBe(movie2.id);
      expect(movie1.userId).toBe(testUser.id);
      expect(movie2.userId).toBe(testUser2.id);
    });
  });

  describe('movies.list', () => {
    it('should return empty array when user has no movies', () => {
      const result = movies.list(testUser.id);
      expect(result).toEqual([]);
    });

    it('should return all movies for a user', () => {
      movies.create({
        userId: testUser.id,
        title: 'Movie 1',
        magnetLink: 'magnet:?xt=urn:btih:111',
        infohash: '111',
      });

      movies.create({
        userId: testUser.id,
        title: 'Movie 2',
        magnetLink: 'magnet:?xt=urn:btih:222',
        infohash: '222',
      });

      const result = movies.list(testUser.id);
      expect(result).toHaveLength(2);
    });

    it('should only return movies for the specified user', () => {
      movies.create({
        userId: testUser.id,
        title: 'User 1 Movie',
        magnetLink: 'magnet:?xt=urn:btih:111',
        infohash: '111',
      });

      movies.create({
        userId: testUser2.id,
        title: 'User 2 Movie',
        magnetLink: 'magnet:?xt=urn:btih:222',
        infohash: '222',
      });

      const user1Movies = movies.list(testUser.id);
      const user2Movies = movies.list(testUser2.id);

      expect(user1Movies).toHaveLength(1);
      expect(user1Movies[0].title).toBe('User 1 Movie');

      expect(user2Movies).toHaveLength(1);
      expect(user2Movies[0].title).toBe('User 2 Movie');
    });

    it('should return movies ordered by addedAt descending', async () => {
      movies.create({
        userId: testUser.id,
        title: 'First Movie',
        magnetLink: 'magnet:?xt=urn:btih:111',
        infohash: '111',
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      movies.create({
        userId: testUser.id,
        title: 'Second Movie',
        magnetLink: 'magnet:?xt=urn:btih:222',
        infohash: '222',
      });

      const result = movies.list(testUser.id);
      expect(result[0].title).toBe('Second Movie');
      expect(result[1].title).toBe('First Movie');
    });
  });

  describe('movies.get', () => {
    it('should return undefined when movie does not exist', () => {
      const result = movies.get('nonexistent-id', testUser.id);
      expect(result).toBeUndefined();
    });

    it('should return the movie when it exists', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      const result = movies.get(created.id, testUser.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.title).toBe('Test Movie');
    });

    it('should not return movie belonging to different user', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'User 1 Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      // Try to get user 1's movie as user 2
      const result = movies.get(created.id, testUser2.id);
      expect(result).toBeUndefined();
    });
  });

  describe('movies.updateProgress', () => {
    it('should update progress and status', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      movies.updateProgress(created.id, 0.5, 'downloading');

      const result = movies.get(created.id, testUser.id);
      expect(result?.progress).toBe(0.5);
      expect(result?.status).toBe('downloading');
    });

    it('should update to complete status', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      movies.updateProgress(created.id, 1.0, 'complete');

      const result = movies.get(created.id, testUser.id);
      expect(result?.progress).toBe(1.0);
      expect(result?.status).toBe('complete');
    });
  });

  describe('movies.updateFilePath', () => {
    it('should update file path and set status to complete', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      movies.updateFilePath(created.id, '/app/data/library/movie.mp4');

      const result = movies.get(created.id, testUser.id);
      expect(result?.filePath).toBe('/app/data/library/movie.mp4');
      expect(result?.status).toBe('complete');
    });
  });

  describe('movies.delete', () => {
    it('should delete the movie', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      movies.delete(created.id, testUser.id);

      const result = movies.get(created.id, testUser.id);
      expect(result).toBeUndefined();
    });

    it('should not delete movie belonging to different user', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      // Try to delete as different user
      movies.delete(created.id, testUser2.id);

      // Movie should still exist
      const result = movies.get(created.id, testUser.id);
      expect(result).toBeDefined();
    });

    it('should not throw when deleting nonexistent movie', () => {
      expect(() => {
        movies.delete('nonexistent-id', testUser.id);
      }).not.toThrow();
    });
  });

  describe('movies.updateLastPlayed', () => {
    it('should update lastPlayedAt timestamp', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: sampleMagnet,
        infohash: sampleInfohash,
      });

      expect(created.lastPlayedAt).toBeNull();

      movies.updateLastPlayed(created.id);

      const result = movies.get(created.id, testUser.id);
      expect(result?.lastPlayedAt).toBeDefined();
      expect(result?.lastPlayedAt).not.toBeNull();
    });
  });
});

describe('Database Constraints and Integrity', () => {
  beforeAll(() => {
    createTables();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM movies');
    testDb.exec('DELETE FROM user');
    db.insert(schema.user).values(testUser).run();
  });

  it('should cascade delete movies when user is deleted', () => {
    // Create a movie for the user
    const created = movies.create({
      userId: testUser.id,
      title: 'Test Movie',
      magnetLink: sampleMagnet,
      infohash: sampleInfohash,
    });

    // Verify movie exists
    expect(movies.get(created.id, testUser.id)).toBeDefined();

    // Delete the user
    db.delete(schema.user).where(eq(schema.user.id, testUser.id)).run();

    // Verify movie is also deleted (cascade)
    const moviesAfterDelete = testDb.prepare('SELECT * FROM movies WHERE id = ?').get(created.id);
    expect(moviesAfterDelete).toBeUndefined();
  });
});
