import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dbCredentials: {
		url: process.env.DATABASE_URL || "./data/plank.db",
	},
	dialect: "sqlite",
	out: "./drizzle",
	schema: "./src/lib/server/db/schema.ts",
});
