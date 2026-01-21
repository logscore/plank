import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from './schema';

// Ensure database directory exists
const dbPath = process.env.DATABASE_URL || './plank.db';
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
