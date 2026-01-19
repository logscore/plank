import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc } from 'drizzle-orm';
import * as schema from '../lib/server/db/schema';

// Create a fresh test database
const testDb = new Database(':memory:');
testDb.pragma('journal_mode = WAL');
const db = drizzle(testDb, { schema });

// Real magnet link for testing (Big Buck Bunny - open source movie)
const REAL_MAGNET = 'magnet:?xt=urn:btih:C39FE3EEFBDB62DA9C27EB6398FF4A7D2E26E7AB&dn=Big.Buck.Bunny.BDRip.XviD-MEDiC&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337';
const REAL_INFOHASH = 'c39fe3eefbdb62da9c27eb6398ff4a7d2e26e7ab';

// Config mock
const config = {
  features: {
    fileStorage: false,
  },
  paths: {
    library: '/app/data/library',
    temp: '/app/data/temp',
  },
  tmdb: {
    apiKey: 'test-api-key',
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
  },
};

// Mock magnet parser - simulates the real parser behavior
// Note: parse-torrent has compatibility issues with vitest, so we mock the behavior
function parseMagnet(magnetLink: string) {
  // Extract infohash from magnet link
  const infohashMatch = magnetLink.match(/btih:([A-Fa-f0-9]{40})/i);
  const infohash = infohashMatch ? infohashMatch[1].toLowerCase() : '';

  // Extract display name
  const dnMatch = magnetLink.match(/dn=([^&]+)/);
  const name = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : '';

  // Simple title parsing (mimics parse-torrent-title behavior)
  let title: string | undefined;
  let year: number | undefined;

  if (name) {
    // Replace dots with spaces, extract year, and clean up
    const cleanName = name.replace(/\./g, ' ');
    const yearMatch = cleanName.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[0]);
      title = cleanName.substring(0, cleanName.indexOf(yearMatch[0])).trim();
    } else {
      // Find where quality info starts
      const qualityMatch = cleanName.match(/\b(BDRip|BluRay|WEB-DL|DVDRip|HDRip|1080p|720p|2160p|XviD|x264|x265)\b/i);
      if (qualityMatch) {
        title = cleanName.substring(0, cleanName.indexOf(qualityMatch[0])).trim();
      } else {
        title = cleanName;
      }
    }
  }

  return {
    infohash,
    name,
    title,
    year,
  };
}

// Movies module
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

// Mock TMDB search
async function searchMovie(query: string, year?: number | null) {
  return [
    {
      tmdbId: 12345,
      title: query,
      year: year || 2024,
      posterUrl: `https://image.tmdb.org/t/p/w500/test-poster.jpg`,
      backdropUrl: `https://image.tmdb.org/t/p/w500/test-backdrop.jpg`,
      overview: `Overview for ${query}`,
    },
  ];
}

// Simulated API handlers
interface Locals {
  user: { id: string; name: string; email: string } | null;
}

function createError(status: number, message: string) {
  return { status, message };
}

// GET /api/movies
async function handleMoviesGet(locals: Locals) {
  if (!locals.user) {
    return { error: createError(401, 'Unauthorized') };
  }
  const list = movies.list(locals.user.id);
  return { data: list, status: 200 };
}

// POST /api/movies
async function handleMoviesPost(locals: Locals, body: { magnetLink?: string }) {
  if (!locals.user) {
    return { error: createError(401, 'Unauthorized') };
  }

  const { magnetLink } = body;

  if (!magnetLink || !magnetLink.startsWith('magnet:')) {
    return { error: createError(400, 'Invalid magnet link') };
  }

  const { infohash, title, year } = parseMagnet(magnetLink);

  let metadata: {
    title: string;
    year: number | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    tmdbId: number | null;
  } = {
    title: title || 'Unknown',
    year: year || null,
    posterUrl: null,
    backdropUrl: null,
    overview: null,
    tmdbId: null,
  };

  if (title && config.tmdb.apiKey) {
    try {
      const results = await searchMovie(title, year);
      if (results.length > 0) {
        metadata = { ...metadata, ...results[0] };
      }
    } catch {
      // TMDB search failed
    }
  }

  try {
    const movie = movies.create({
      userId: locals.user.id,
      title: metadata.title,
      year: metadata.year,
      posterUrl: metadata.posterUrl,
      backdropUrl: metadata.backdropUrl,
      overview: metadata.overview,
      magnetLink,
      infohash,
      tmdbId: metadata.tmdbId,
    });

    return { data: movie, status: 201 };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
      return { error: createError(409, 'Movie already exists in library') };
    }
    throw e;
  }
}

// GET /api/movies/[id]
async function handleMovieGet(locals: Locals, id: string) {
  if (!locals.user) {
    return { error: createError(401, 'Unauthorized') };
  }

  const movie = movies.get(id, locals.user.id);
  if (!movie) {
    return { error: createError(404, 'Movie not found') };
  }

  movies.updateLastPlayed(id);
  return { data: movie, status: 200 };
}

// DELETE /api/movies/[id]
async function handleMovieDelete(locals: Locals, id: string) {
  if (!locals.user) {
    return { error: createError(401, 'Unauthorized') };
  }

  movies.delete(id, locals.user.id);
  return { status: 204 };
}

// POST /api/movies/[id]/progress
const validStatuses = ['added', 'downloading', 'complete'] as const;
type MovieStatus = (typeof validStatuses)[number];

function isValidStatus(status: unknown): status is MovieStatus {
  return typeof status === 'string' && validStatuses.includes(status as MovieStatus);
}

async function handleProgressPost(
  locals: Locals,
  id: string,
  body: { progress?: number; status?: string }
) {
  if (!locals.user) {
    return { error: createError(401, 'Unauthorized') };
  }

  const movie = movies.get(id, locals.user.id);
  if (!movie) {
    return { error: createError(404, 'Movie not found') };
  }

  const { progress, status } = body;

  if (typeof progress === 'number' && isValidStatus(status)) {
    movies.updateProgress(id, progress, status);
  }

  return { data: { success: true }, status: 200 };
}

// GET /api/search
async function handleSearch(
  locals: Locals,
  params: { q?: string | null; year?: string | null }
) {
  if (!locals.user) {
    return { error: createError(401, 'Unauthorized') };
  }

  const { q: query, year } = params;

  if (!query) {
    return { error: createError(400, 'Query parameter required') };
  }

  if (!config.tmdb.apiKey) {
    return { error: createError(500, 'TMDB API key not configured') };
  }

  const results = await searchMovie(query, year ? parseInt(year) : null);
  return { data: results, status: 200 };
}

// Test fixtures
const testUser = {
  id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testUser2 = {
  id: 'test-user-456',
  name: 'Other User',
  email: 'other@example.com',
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

describe('API Routes', () => {
  beforeAll(() => {
    createTables();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM movies');
    testDb.exec('DELETE FROM user');
    db.insert(schema.user).values(testUser).run();
    db.insert(schema.user).values(testUser2).run();
  });

  describe('GET /api/movies', () => {
    it('should return 401 when not authenticated', async () => {
      const result = await handleMoviesGet({ user: null });
      expect(result.error?.status).toBe(401);
    });

    it('should return empty array when user has no movies', async () => {
      const result = await handleMoviesGet({ user: testUser });
      expect(result.data).toEqual([]);
      expect(result.status).toBe(200);
    });

    it('should return user movies', async () => {
      movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: REAL_INFOHASH,
      });

      const result = await handleMoviesGet({ user: testUser });
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].title).toBe('Test Movie');
    });

    it('should only return movies for authenticated user', async () => {
      movies.create({
        userId: testUser.id,
        title: 'User 1 Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'user1hash123456789012345678901234567890',
      });

      movies.create({
        userId: testUser2.id,
        title: 'User 2 Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'user2hash123456789012345678901234567890',
      });

      const result1 = await handleMoviesGet({ user: testUser });
      const result2 = await handleMoviesGet({ user: testUser2 });

      expect(result1.data).toHaveLength(1);
      expect(result1.data?.[0].title).toBe('User 1 Movie');

      expect(result2.data).toHaveLength(1);
      expect(result2.data?.[0].title).toBe('User 2 Movie');
    });
  });

  describe('POST /api/movies', () => {
    it('should return 401 when not authenticated', async () => {
      const result = await handleMoviesPost({ user: null }, { magnetLink: REAL_MAGNET });
      expect(result.error?.status).toBe(401);
    });

    it('should return 400 for missing magnet link', async () => {
      const result = await handleMoviesPost({ user: testUser }, {});
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('Invalid magnet link');
    });

    it('should return 400 for invalid magnet link', async () => {
      const result = await handleMoviesPost({ user: testUser }, { magnetLink: 'not-a-magnet' });
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('Invalid magnet link');
    });

    it('should create movie with valid magnet link', async () => {
      const result = await handleMoviesPost({ user: testUser }, { magnetLink: REAL_MAGNET });

      expect(result.status).toBe(201);
      expect(result.data?.title).toBe('Big Buck Bunny');
      expect(result.data?.userId).toBe(testUser.id);
      expect(result.data?.magnetLink).toBe(REAL_MAGNET);
      expect(result.data?.infohash).toBe(REAL_INFOHASH);
      expect(result.data?.status).toBe('added');
    });

    it('should enrich with TMDB metadata', async () => {
      const result = await handleMoviesPost({ user: testUser }, { magnetLink: REAL_MAGNET });

      expect(result.data?.posterUrl).toContain('image.tmdb.org');
      expect(result.data?.backdropUrl).toContain('image.tmdb.org');
      expect(result.data?.overview).toBeDefined();
      expect(result.data?.tmdbId).toBe(12345);
    });

    it('should return 409 for duplicate movie (same user + infohash)', async () => {
      await handleMoviesPost({ user: testUser }, { magnetLink: REAL_MAGNET });
      const result = await handleMoviesPost({ user: testUser }, { magnetLink: REAL_MAGNET });

      expect(result.error?.status).toBe(409);
    });

    it('should allow same movie for different users', async () => {
      const result1 = await handleMoviesPost({ user: testUser }, { magnetLink: REAL_MAGNET });
      const result2 = await handleMoviesPost({ user: testUser2 }, { magnetLink: REAL_MAGNET });

      expect(result1.status).toBe(201);
      expect(result2.status).toBe(201);
      expect(result1.data?.id).not.toBe(result2.data?.id);
    });

    it('should handle magnet without display name', async () => {
      const magnetNoName = 'magnet:?xt=urn:btih:C39FE3EEFBDB62DA9C27EB6398FF4A7D2E26E7AB';
      // Need to use different user to avoid duplicate constraint
      const result = await handleMoviesPost({ user: testUser2 }, { magnetLink: magnetNoName });

      expect(result.status).toBe(201);
      expect(result.data?.title).toBe('Unknown');
    });
  });

  describe('GET /api/movies/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      const result = await handleMovieGet({ user: null }, 'some-id');
      expect(result.error?.status).toBe(401);
    });

    it('should return 404 for nonexistent movie', async () => {
      const result = await handleMovieGet({ user: testUser }, 'nonexistent-id');
      expect(result.error?.status).toBe(404);
    });

    it('should return movie details', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'gethash1234567890123456789012345678901',
      });

      const result = await handleMovieGet({ user: testUser }, created.id);

      expect(result.status).toBe(200);
      expect(result.data?.id).toBe(created.id);
      expect(result.data?.title).toBe('Test Movie');
    });

    it('should not return movie belonging to different user', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'gethash2234567890123456789012345678901',
      });

      const result = await handleMovieGet({ user: testUser2 }, created.id);

      expect(result.error?.status).toBe(404);
    });

    it('should update lastPlayedAt when getting movie', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'gethash3234567890123456789012345678901',
      });

      expect(created.lastPlayedAt).toBeNull();

      await handleMovieGet({ user: testUser }, created.id);

      const updated = movies.get(created.id, testUser.id);
      expect(updated?.lastPlayedAt).not.toBeNull();
    });
  });

  describe('DELETE /api/movies/[id]', () => {
    it('should return 401 when not authenticated', async () => {
      const result = await handleMovieDelete({ user: null }, 'some-id');
      expect(result.error?.status).toBe(401);
    });

    it('should delete movie', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'delhash1234567890123456789012345678901',
      });

      const result = await handleMovieDelete({ user: testUser }, created.id);

      expect(result.status).toBe(204);
      expect(movies.get(created.id, testUser.id)).toBeUndefined();
    });

    it('should not delete movie belonging to different user', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'delhash2234567890123456789012345678901',
      });

      await handleMovieDelete({ user: testUser2 }, created.id);

      expect(movies.get(created.id, testUser.id)).toBeDefined();
    });

    it('should not throw for nonexistent movie', async () => {
      const result = await handleMovieDelete({ user: testUser }, 'nonexistent-id');
      expect(result.status).toBe(204);
    });
  });

  describe('POST /api/movies/[id]/progress', () => {
    it('should return 401 when not authenticated', async () => {
      const result = await handleProgressPost({ user: null }, 'some-id', {
        progress: 0.5,
        status: 'downloading',
      });
      expect(result.error?.status).toBe(401);
    });

    it('should return 404 for nonexistent movie', async () => {
      const result = await handleProgressPost({ user: testUser }, 'nonexistent-id', {
        progress: 0.5,
        status: 'downloading',
      });
      expect(result.error?.status).toBe(404);
    });

    it('should update progress and status', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'proghash123456789012345678901234567890',
      });

      const result = await handleProgressPost({ user: testUser }, created.id, {
        progress: 0.5,
        status: 'downloading',
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);

      const updated = movies.get(created.id, testUser.id);
      expect(updated?.progress).toBe(0.5);
      expect(updated?.status).toBe('downloading');
    });

    it('should not update with invalid status', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'proghash223456789012345678901234567890',
      });

      await handleProgressPost({ user: testUser }, created.id, {
        progress: 0.5,
        status: 'invalid-status',
      });

      const updated = movies.get(created.id, testUser.id);
      expect(updated?.progress).toBe(0);
      expect(updated?.status).toBe('added');
    });

    it('should update to complete status', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'proghash323456789012345678901234567890',
      });

      await handleProgressPost({ user: testUser }, created.id, {
        progress: 1.0,
        status: 'complete',
      });

      const updated = movies.get(created.id, testUser.id);
      expect(updated?.progress).toBe(1.0);
      expect(updated?.status).toBe('complete');
    });

    it('should not update movie belonging to different user', async () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: 'proghash423456789012345678901234567890',
      });

      const result = await handleProgressPost({ user: testUser2 }, created.id, {
        progress: 0.5,
        status: 'downloading',
      });

      expect(result.error?.status).toBe(404);
    });
  });

  describe('GET /api/search', () => {
    it('should return 401 when not authenticated', async () => {
      const result = await handleSearch({ user: null }, { q: 'matrix' });
      expect(result.error?.status).toBe(401);
    });

    it('should return 400 when query is missing', async () => {
      const result = await handleSearch({ user: testUser }, { q: null });
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toBe('Query parameter required');
    });

    it('should return search results', async () => {
      const result = await handleSearch({ user: testUser }, { q: 'Matrix', year: '1999' });

      expect(result.status).toBe(200);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].title).toBe('Matrix');
      expect(result.data?.[0].year).toBe(1999);
    });

    it('should search without year', async () => {
      const result = await handleSearch({ user: testUser }, { q: 'Inception', year: null });

      expect(result.status).toBe(200);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].title).toBe('Inception');
    });
  });
});

describe('API Authorization Edge Cases', () => {
  beforeAll(() => {
    createTables();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM movies');
    testDb.exec('DELETE FROM user');
    db.insert(schema.user).values(testUser).run();
    db.insert(schema.user).values(testUser2).run();
  });

  it('should prevent cross-user movie access in all endpoints', async () => {
    const created = movies.create({
      userId: testUser.id,
      title: 'Private Movie',
      magnetLink: REAL_MAGNET,
      infohash: 'privatehash123456789012345678901234567',
    });

    // User 2 should not be able to get the movie
    const getResult = await handleMovieGet({ user: testUser2 }, created.id);
    expect(getResult.error?.status).toBe(404);

    // User 2 should not be able to update its progress
    const progressResult = await handleProgressPost({ user: testUser2 }, created.id, {
      progress: 0.5,
      status: 'downloading',
    });
    expect(progressResult.error?.status).toBe(404);

    // Delete should silently fail but not delete
    await handleMovieDelete({ user: testUser2 }, created.id);
    expect(movies.get(created.id, testUser.id)).toBeDefined();

    // List should not include it
    const listResult = await handleMoviesGet({ user: testUser2 });
    expect(listResult.data?.find((m) => m.id === created.id)).toBeUndefined();
  });
});

describe('Input Validation', () => {
  beforeAll(() => {
    createTables();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM movies');
    testDb.exec('DELETE FROM user');
    db.insert(schema.user).values(testUser).run();
  });

  it('should reject empty magnet link', async () => {
    const result = await handleMoviesPost({ user: testUser }, { magnetLink: '' });
    expect(result.error?.status).toBe(400);
  });

  it('should reject magnet link not starting with magnet:', async () => {
    const result = await handleMoviesPost({ user: testUser }, { magnetLink: 'http://example.com' });
    expect(result.error?.status).toBe(400);
  });

  it('should handle empty search query', async () => {
    const result = await handleSearch({ user: testUser }, { q: '' });
    expect(result.error?.status).toBe(400);
  });

  it('should validate progress status values', async () => {
    const created = movies.create({
      userId: testUser.id,
      title: 'Test Movie',
      magnetLink: REAL_MAGNET,
      infohash: 'validhash12345678901234567890123456789',
    });

    for (const status of ['added', 'downloading', 'complete']) {
      await handleProgressPost({ user: testUser }, created.id, {
        progress: 0.5,
        status,
      });
      const updated = movies.get(created.id, testUser.id);
      expect(updated?.status).toBe(status);
    }
  });
});
