import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { schema } from '../src/lib/server/db/schema';

// Connect to the database
// Assuming the script is run from the project root or we can handle relative path
const dbPath = './plank.db';
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

async function seed() {
	console.log('Seeding movies...');

	// 1. Get or Create a User
	let user = await db.query.user.findFirst();
	if (!user) {
		console.log('No user found, creating a default user...');
		const newUser = {
			id: crypto.randomUUID(),
			name: 'Test User',
			email: 'test@example.com',
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		await db.insert(schema.user).values(newUser);
		user = await db.query.user.findFirst();
	}

	if (!user) {
		throw new Error('Failed to find or create user');
	}
	console.log(`Using user: ${user.name} (${user.id})`);

	// 2. Generate Movies
	const moviesToInsert = [];
	const statuses = ['added', 'downloading', 'complete', 'error'] as const;

	for (let i = 1; i <= 100; i++) {
		const status = statuses[Math.floor(Math.random() * statuses.length)];
		const progress =
			status === 'complete' ? 100 : status === 'downloading' ? Math.random() * 100 : 0;

		moviesToInsert.push({
			id: crypto.randomUUID(),
			userId: user.id,
			title: `Test Movie ${i}`,
			year: 2000 + Math.floor(Math.random() * 25),
			overview: `This is a randomly generated overview for Test Movie ${i}. It is used to test the UI overflow behavior and ensure that the layout handles long lists of items correctly.`,
			magnetLink: `magnet:?xt=urn:btih:mockhash${i}&dn=Movie+${i}`,
			infohash: `mockhash${i}${Date.now()}`, // Ensure uniqueness
			status,
			progress,
			runtime: 90 + Math.floor(Math.random() * 60),
			addedAt: new Date(Date.now() - Math.floor(Math.random() * 10_000_000_000)), // Random time in the past
		});
	}

	// 3. Insert Movies (in batches to be safe, though SQLite handles 100 fine)
	console.log(`Inserting ${moviesToInsert.length} movies...`);
	try {
		await db.insert(schema.movies).values(moviesToInsert);
		console.log('Successfully inserted movies!');
	} catch (e) {
		console.error('Error inserting movies:', e);
	}
}

seed()
	.then(() => {
		console.log('Done.');
		process.exit(0);
	})
	.catch((err) => {
		console.error('Seed failed:', err);
		process.exit(1);
	});
