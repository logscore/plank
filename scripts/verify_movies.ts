import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { movies, schema } from '../src/lib/server/db/schema';

const dbPath = './plank.db';
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

async function verify() {
	const _result = await db.select({ count: sql<number>`count(*)` }).from(movies);

	// Check a sample
	const _sample = await db.query.movies.findFirst();
}

verify()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
