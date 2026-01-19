import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';

// Create a test database
const testDb = new Database(':memory:');
testDb.pragma('journal_mode = WAL');

export const db = drizzle(testDb, { schema });

// Mock environment variables
vi.mock('$env/dynamic/private', () => ({
  env: {
    DATABASE_URL: ':memory:',
    BETTER_AUTH_SECRET: 'test-secret-key-for-testing-purposes',
    BETTER_AUTH_URL: 'http://localhost:5173',
    TMDB_API_KEY: 'test-tmdb-api-key',
    ENABLE_FILE_STORAGE: 'false',
  },
}));

// Create tables before all tests
beforeAll(() => {
  // Create user table
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
  `);

  // Create session table
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
    );
  `);

  // Create account table
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create verification table
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      updated_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
    );
  `);

  // Create movies table
  testDb.exec(`
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
  `);

  // Create indexes
  testDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_movies_user ON movies(user_id);
    CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
  `);
});

// Clean tables before each test
beforeEach(() => {
  testDb.exec('DELETE FROM movies');
  testDb.exec('DELETE FROM session');
  testDb.exec('DELETE FROM account');
  testDb.exec('DELETE FROM verification');
  testDb.exec('DELETE FROM user');
});

afterAll(() => {
  testDb.close();
});

// Export testDb for direct SQL access in tests
export { testDb };
