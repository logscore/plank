import Database from 'better-sqlite3';
import { and, asc, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../lib/server/db/schema';
import type { MediaType } from '../lib/types';

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

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      type TEXT DEFAULT 'movie' NOT NULL,
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
      runtime INTEGER,
      genres TEXT,
      original_language TEXT,
      certification TEXT,
      total_seasons INTEGER,
      added_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      last_played_at INTEGER,
      UNIQUE(user_id, infohash)
    );

    CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id);
    CREATE INDEX IF NOT EXISTS idx_media_status ON media(status);
    CREATE INDEX IF NOT EXISTS idx_media_type ON media(user_id, type);

    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL,
      name TEXT,
      overview TEXT,
      poster_path TEXT,
      air_date TEXT,
      episode_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      UNIQUE(media_id, season_number)
    );

    CREATE INDEX IF NOT EXISTS idx_seasons_media ON seasons(media_id);

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      download_id TEXT,
      episode_number INTEGER NOT NULL,
      title TEXT,
      overview TEXT,
      still_path TEXT,
      runtime INTEGER,
      air_date TEXT,
      file_index INTEGER,
      file_path TEXT,
      file_size INTEGER,
      downloaded_bytes INTEGER DEFAULT 0,
      display_order INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
      UNIQUE(season_id, episode_number)
    );

    CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_download ON episodes(download_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);
    CREATE INDEX IF NOT EXISTS idx_episodes_display_order ON episodes(season_id, display_order);
  `);
}

// Media module that mirrors the real implementation
const mediaDb = {
	list(userId: string, type?: MediaType) {
		if (type) {
			return db
				.select()
				.from(schema.media)
				.where(and(eq(schema.media.userId, userId), eq(schema.media.type, type)))
				.orderBy(desc(schema.media.addedAt))
				.all();
		}
		return db
			.select()
			.from(schema.media)
			.where(eq(schema.media.userId, userId))
			.orderBy(desc(schema.media.addedAt))
			.all();
	},

	get(id: string, userId: string) {
		return db
			.select()
			.from(schema.media)
			.where(and(eq(schema.media.id, id), eq(schema.media.userId, userId)))
			.get();
	},

	getById(id: string) {
		return db.select().from(schema.media).where(eq(schema.media.id, id)).get();
	},

	getByInfohash(infohash: string, userId: string) {
		return db
			.select()
			.from(schema.media)
			.where(and(eq(schema.media.infohash, infohash), eq(schema.media.userId, userId)))
			.get();
	},

	create(mediaItem: {
		userId: string;
		type?: MediaType;
		title: string;
		year?: number | null;
		posterUrl?: string | null;
		backdropUrl?: string | null;
		overview?: string | null;
		magnetLink: string;
		infohash: string;
		tmdbId?: number | null;
		totalSeasons?: number | null;
	}) {
		const id = crypto.randomUUID();
		const now = new Date();

		const newMedia = {
			id,
			userId: mediaItem.userId,
			type: mediaItem.type || 'movie',
			title: mediaItem.title,
			year: mediaItem.year ?? null,
			posterUrl: mediaItem.posterUrl ?? null,
			backdropUrl: mediaItem.backdropUrl ?? null,
			overview: mediaItem.overview ?? null,
			magnetLink: mediaItem.magnetLink,
			infohash: mediaItem.infohash,
			tmdbId: mediaItem.tmdbId ?? null,
			totalSeasons: mediaItem.totalSeasons ?? null,
			status: 'added' as const,
			progress: 0,
			addedAt: now,
			filePath: null,
			fileSize: null,
			lastPlayedAt: null,
		};

		db.insert(schema.media).values(newMedia).run();

		return newMedia;
	},

	updateProgress(
		id: string,
		progress: number,
		status: 'added' | 'downloading' | 'complete' | 'error'
	) {
		db.update(schema.media).set({ progress, status }).where(eq(schema.media.id, id)).run();
	},

	updateFilePath(id: string, filePath: string, fileSize?: number) {
		db.update(schema.media)
			.set({ filePath, fileSize: fileSize ?? null, status: 'complete' })
			.where(eq(schema.media.id, id))
			.run();
	},

	delete(id: string, userId: string) {
		db.delete(schema.media)
			.where(and(eq(schema.media.id, id), eq(schema.media.userId, userId)))
			.run();
	},
};

// Seasons module
const seasonsDb = {
	create(season: {
		mediaId: string;
		seasonNumber: number;
		name?: string | null;
		overview?: string | null;
		episodeCount?: number | null;
	}) {
		const id = crypto.randomUUID();

		const newSeason = {
			id,
			mediaId: season.mediaId,
			seasonNumber: season.seasonNumber,
			name: season.name ?? null,
			overview: season.overview ?? null,
			episodeCount: season.episodeCount ?? 0,
			createdAt: new Date(),
		};

		db.insert(schema.seasons).values(newSeason).run();
		return newSeason;
	},

	getByMediaId(mediaId: string) {
		return db
			.select()
			.from(schema.seasons)
			.where(eq(schema.seasons.mediaId, mediaId))
			.orderBy(asc(schema.seasons.seasonNumber))
			.all();
	},

	getByMediaAndNumber(mediaId: string, seasonNumber: number) {
		return db
			.select()
			.from(schema.seasons)
			.where(
				and(
					eq(schema.seasons.mediaId, mediaId),
					eq(schema.seasons.seasonNumber, seasonNumber)
				)
			)
			.get();
	},

	updateEpisodeCount(id: string, count: number) {
		db.update(schema.seasons)
			.set({ episodeCount: count })
			.where(eq(schema.seasons.id, id))
			.run();
	},
};

// Episodes module
const episodesDb = {
	create(episode: {
		seasonId: string;
		episodeNumber: number;
		title?: string | null;
		overview?: string | null;
		runtime?: number | null;
		fileIndex?: number | null;
		displayOrder: number;
		status?: 'pending' | 'downloading' | 'complete' | 'error';
	}) {
		const id = crypto.randomUUID();

		const newEpisode = {
			id,
			seasonId: episode.seasonId,
			episodeNumber: episode.episodeNumber,
			title: episode.title ?? null,
			overview: episode.overview ?? null,
			runtime: episode.runtime ?? null,
			fileIndex: episode.fileIndex ?? null,
			displayOrder: episode.displayOrder,
			status: episode.status || 'pending',
			createdAt: new Date(),
		};

		db.insert(schema.episodes).values(newEpisode).run();
		return newEpisode;
	},

	getBySeasonId(seasonId: string) {
		return db
			.select()
			.from(schema.episodes)
			.where(eq(schema.episodes.seasonId, seasonId))
			.orderBy(asc(schema.episodes.displayOrder))
			.all();
	},

	getBySeasonAndNumber(seasonId: string, episodeNumber: number) {
		return db
			.select()
			.from(schema.episodes)
			.where(
				and(
					eq(schema.episodes.seasonId, seasonId),
					eq(schema.episodes.episodeNumber, episodeNumber)
				)
			)
			.get();
	},

	updateDisplayOrder(id: string, displayOrder: number) {
		db.update(schema.episodes).set({ displayOrder }).where(eq(schema.episodes.id, id)).run();
	},

	updateFileInfo(id: string, fileIndex: number, filePath: string, fileSize: number) {
		db.update(schema.episodes)
			.set({ fileIndex, filePath, fileSize })
			.where(eq(schema.episodes.id, id))
			.run();
	},

	updateProgress(
		id: string,
		downloadedBytes: number,
		status: 'pending' | 'downloading' | 'complete' | 'error'
	) {
		db.update(schema.episodes)
			.set({ downloadedBytes, status })
			.where(eq(schema.episodes.id, id))
			.run();
	},
};

// Test user fixtures
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

// Sample magnet links for testing
const movieMagnet = 'magnet:?xt=urn:btih:abc123&dn=Test+Movie+2024';
const tvMagnet = 'magnet:?xt=urn:btih:def456&dn=Test+Show+S01';

describe('Media Database Module', () => {
	beforeAll(() => {
		createTables();
	});

	beforeEach(() => {
		// Clear tables
		testDb.exec('DELETE FROM episodes');
		testDb.exec('DELETE FROM seasons');
		testDb.exec('DELETE FROM media');
		testDb.exec('DELETE FROM user');

		// Insert test users
		db.insert(schema.user).values(testUser).run();
		db.insert(schema.user).values(testUser2).run();
	});

	describe('mediaDb.create', () => {
		it('should create a movie with default type', () => {
			const media = mediaDb.create({
				userId: testUser.id,
				title: 'Test Movie',
				magnetLink: movieMagnet,
				infohash: 'abc123',
			});

			expect(media.type).toBe('movie');
			expect(media.title).toBe('Test Movie');
		});

		it('should create a TV show with type "tv"', () => {
			const media = mediaDb.create({
				userId: testUser.id,
				type: 'tv',
				title: 'Test Show',
				magnetLink: tvMagnet,
				infohash: 'def456',
				totalSeasons: 3,
			});

			expect(media.type).toBe('tv');
			expect(media.title).toBe('Test Show');
			expect(media.totalSeasons).toBe(3);
		});

		it('should enforce unique constraint on userId + infohash', () => {
			mediaDb.create({
				userId: testUser.id,
				title: 'First',
				magnetLink: movieMagnet,
				infohash: 'same-hash',
			});

			expect(() => {
				mediaDb.create({
					userId: testUser.id,
					title: 'Second',
					magnetLink: movieMagnet,
					infohash: 'same-hash',
				});
			}).toThrow();
		});
	});

	describe('mediaDb.list', () => {
		it('should list all media for a user', () => {
			mediaDb.create({
				userId: testUser.id,
				type: 'movie',
				title: 'Movie 1',
				magnetLink: 'magnet:1',
				infohash: '1',
			});

			mediaDb.create({
				userId: testUser.id,
				type: 'tv',
				title: 'Show 1',
				magnetLink: 'magnet:2',
				infohash: '2',
			});

			const result = mediaDb.list(testUser.id);
			expect(result).toHaveLength(2);
		});

		it('should filter by type when specified', () => {
			mediaDb.create({
				userId: testUser.id,
				type: 'movie',
				title: 'Movie 1',
				magnetLink: 'magnet:1',
				infohash: '1',
			});

			mediaDb.create({
				userId: testUser.id,
				type: 'tv',
				title: 'Show 1',
				magnetLink: 'magnet:2',
				infohash: '2',
			});

			mediaDb.create({
				userId: testUser.id,
				type: 'tv',
				title: 'Show 2',
				magnetLink: 'magnet:3',
				infohash: '3',
			});

			const movies = mediaDb.list(testUser.id, 'movie');
			expect(movies).toHaveLength(1);
			expect(movies[0].title).toBe('Movie 1');

			const shows = mediaDb.list(testUser.id, 'tv');
			expect(shows).toHaveLength(2);
		});

		it('should only return media for the specified user', () => {
			mediaDb.create({
				userId: testUser.id,
				title: 'User 1 Media',
				magnetLink: 'magnet:1',
				infohash: '1',
			});

			mediaDb.create({
				userId: testUser2.id,
				title: 'User 2 Media',
				magnetLink: 'magnet:2',
				infohash: '2',
			});

			const result = mediaDb.list(testUser.id);
			expect(result).toHaveLength(1);
			expect(result[0].title).toBe('User 1 Media');
		});
	});

	describe('mediaDb.get and getById', () => {
		it('should get media by id and userId', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				title: 'Test',
				magnetLink: movieMagnet,
				infohash: 'abc',
			});

			const result = mediaDb.get(created.id, testUser.id);
			expect(result?.id).toBe(created.id);
		});

		it('should not return media for wrong user', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				title: 'Test',
				magnetLink: movieMagnet,
				infohash: 'abc',
			});

			const result = mediaDb.get(created.id, testUser2.id);
			expect(result).toBeUndefined();
		});

		it('should get media by id only (internal use)', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				title: 'Test',
				magnetLink: movieMagnet,
				infohash: 'abc',
			});

			const result = mediaDb.getById(created.id);
			expect(result?.id).toBe(created.id);
		});
	});

	describe('mediaDb.updateProgress', () => {
		it('should update progress and status', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				title: 'Test',
				magnetLink: movieMagnet,
				infohash: 'abc',
			});

			mediaDb.updateProgress(created.id, 0.5, 'downloading');

			const result = mediaDb.get(created.id, testUser.id);
			expect(result?.progress).toBe(0.5);
			expect(result?.status).toBe('downloading');
		});
	});

	describe('mediaDb.delete', () => {
		it('should delete media', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				title: 'Test',
				magnetLink: movieMagnet,
				infohash: 'abc',
			});

			mediaDb.delete(created.id, testUser.id);

			const result = mediaDb.get(created.id, testUser.id);
			expect(result).toBeUndefined();
		});

		it('should not delete media for wrong user', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				title: 'Test',
				magnetLink: movieMagnet,
				infohash: 'abc',
			});

			mediaDb.delete(created.id, testUser2.id);

			const result = mediaDb.get(created.id, testUser.id);
			expect(result).toBeDefined();
		});
	});
});

describe('Seasons Database Module', () => {
	beforeAll(() => {
		createTables();
	});

	beforeEach(() => {
		testDb.exec('DELETE FROM episodes');
		testDb.exec('DELETE FROM seasons');
		testDb.exec('DELETE FROM media');
		testDb.exec('DELETE FROM user');

		db.insert(schema.user).values(testUser).run();
	});

	it('should create a season for a TV show', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
			name: 'Season 1',
			episodeCount: 10,
		});

		expect(season.seasonNumber).toBe(1);
		expect(season.name).toBe('Season 1');
		expect(season.episodeCount).toBe(10);
	});

	it('should list seasons in order', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		seasonsDb.create({ mediaId: tvShow.id, seasonNumber: 3, name: 'Season 3' });
		seasonsDb.create({ mediaId: tvShow.id, seasonNumber: 1, name: 'Season 1' });
		seasonsDb.create({ mediaId: tvShow.id, seasonNumber: 2, name: 'Season 2' });

		const seasons = seasonsDb.getByMediaId(tvShow.id);

		expect(seasons).toHaveLength(3);
		expect(seasons[0].seasonNumber).toBe(1);
		expect(seasons[1].seasonNumber).toBe(2);
		expect(seasons[2].seasonNumber).toBe(3);
	});

	it('should get season by media and number', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		seasonsDb.create({ mediaId: tvShow.id, seasonNumber: 1, name: 'Season 1' });
		seasonsDb.create({ mediaId: tvShow.id, seasonNumber: 2, name: 'Season 2' });

		const season = seasonsDb.getByMediaAndNumber(tvShow.id, 2);
		expect(season?.name).toBe('Season 2');
	});

	it('should enforce unique constraint on mediaId + seasonNumber', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		seasonsDb.create({ mediaId: tvShow.id, seasonNumber: 1, name: 'Season 1' });

		expect(() => {
			seasonsDb.create({ mediaId: tvShow.id, seasonNumber: 1, name: 'Duplicate' });
		}).toThrow();
	});
});

describe('Episodes Database Module', () => {
	beforeAll(() => {
		createTables();
	});

	beforeEach(() => {
		testDb.exec('DELETE FROM episodes');
		testDb.exec('DELETE FROM seasons');
		testDb.exec('DELETE FROM media');
		testDb.exec('DELETE FROM user');

		db.insert(schema.user).values(testUser).run();
	});

	it('should create an episode', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
			name: 'Season 1',
		});

		const episode = episodesDb.create({
			seasonId: season.id,
			episodeNumber: 1,
			title: 'Pilot',
			runtime: 45,
			displayOrder: 0,
		});

		expect(episode.episodeNumber).toBe(1);
		expect(episode.title).toBe('Pilot');
		expect(episode.runtime).toBe(45);
		expect(episode.status).toBe('pending');
	});

	it('should list episodes in display order', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
		});

		episodesDb.create({
			seasonId: season.id,
			episodeNumber: 1,
			title: 'Ep 1',
			displayOrder: 2,
		});
		episodesDb.create({
			seasonId: season.id,
			episodeNumber: 2,
			title: 'Ep 2',
			displayOrder: 0,
		});
		episodesDb.create({
			seasonId: season.id,
			episodeNumber: 3,
			title: 'Ep 3',
			displayOrder: 1,
		});

		const episodes = episodesDb.getBySeasonId(season.id);

		expect(episodes).toHaveLength(3);
		expect(episodes[0].title).toBe('Ep 2');
		expect(episodes[1].title).toBe('Ep 3');
		expect(episodes[2].title).toBe('Ep 1');
	});

	it('should update display order for reordering', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
		});

		const ep1 = episodesDb.create({
			seasonId: season.id,
			episodeNumber: 1,
			title: 'Ep 1',
			displayOrder: 0,
		});
		const ep2 = episodesDb.create({
			seasonId: season.id,
			episodeNumber: 2,
			title: 'Ep 2',
			displayOrder: 1,
		});

		// Swap order
		episodesDb.updateDisplayOrder(ep1.id, 1);
		episodesDb.updateDisplayOrder(ep2.id, 0);

		const episodes = episodesDb.getBySeasonId(season.id);

		expect(episodes[0].title).toBe('Ep 2');
		expect(episodes[1].title).toBe('Ep 1');
	});

	it('should update file info', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
		});

		const episode = episodesDb.create({
			seasonId: season.id,
			episodeNumber: 1,
			title: 'Pilot',
			displayOrder: 0,
		});

		episodesDb.updateFileInfo(episode.id, 0, '/path/to/file.mp4', 1_000_000);

		const updated = episodesDb.getBySeasonAndNumber(season.id, 1);
		expect(updated?.fileIndex).toBe(0);
		expect(updated?.filePath).toBe('/path/to/file.mp4');
		expect(updated?.fileSize).toBe(1_000_000);
	});

	it('should update download progress', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
		});

		const episode = episodesDb.create({
			seasonId: season.id,
			episodeNumber: 1,
			title: 'Pilot',
			displayOrder: 0,
		});

		episodesDb.updateProgress(episode.id, 500_000, 'downloading');

		const updated = episodesDb.getBySeasonAndNumber(season.id, 1);
		expect(updated?.downloadedBytes).toBe(500_000);
		expect(updated?.status).toBe('downloading');
	});
});

describe('Cascade Delete', () => {
	beforeAll(() => {
		createTables();
	});

	beforeEach(() => {
		testDb.exec('DELETE FROM episodes');
		testDb.exec('DELETE FROM seasons');
		testDb.exec('DELETE FROM media');
		testDb.exec('DELETE FROM user');

		db.insert(schema.user).values(testUser).run();
	});

	it('should cascade delete seasons when media is deleted', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
		});

		mediaDb.delete(tvShow.id, testUser.id);

		const seasons = seasonsDb.getByMediaId(tvShow.id);
		expect(seasons).toHaveLength(0);
	});

	it('should cascade delete episodes when season is deleted', () => {
		const tvShow = mediaDb.create({
			userId: testUser.id,
			type: 'tv',
			title: 'Test Show',
			magnetLink: tvMagnet,
			infohash: 'abc',
		});

		const season = seasonsDb.create({
			mediaId: tvShow.id,
			seasonNumber: 1,
		});

		episodesDb.create({
			seasonId: season.id,
			episodeNumber: 1,
			title: 'Ep 1',
			displayOrder: 0,
		});
		episodesDb.create({
			seasonId: season.id,
			episodeNumber: 2,
			title: 'Ep 2',
			displayOrder: 1,
		});

		// Delete the media, which should cascade to seasons and episodes
		mediaDb.delete(tvShow.id, testUser.id);

		const episodes = episodesDb.getBySeasonId(season.id);
		expect(episodes).toHaveLength(0);
	});
});
