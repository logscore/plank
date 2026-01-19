
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../src/lib/server/db/schema';
import { sql } from 'drizzle-orm';

const dbPath = './plank.db';
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

async function verify() {
    const result = await db.select({ count: sql<number>`count(*)` }).from(schema.movies);
    console.log(`Total movies in DB: ${result[0].count}`);

    // Check a sample
    const sample = await db.query.movies.findFirst();
    console.log('Sample movie:', sample?.title);
}

verify()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
