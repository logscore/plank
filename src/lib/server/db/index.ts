import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema";

// Ensure database directory exists
const dbPath = process.env.DATABASE_URL;
if (dbPath) {
	throw new Error("DATABASE_URL is not defined");
}
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
