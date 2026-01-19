import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import * as schema from './schema';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

// Ensure database directory exists
const dbPath = env.DATABASE_URL || './plank.db';
const dbDir = dirname(dbPath);
if (dbDir && dbDir !== '.') {
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export * from './schema';
