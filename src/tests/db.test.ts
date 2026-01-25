import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../lib/server/db/schema';

// Test Data
const testUser = {
	id: 'user-1',
	name: 'Test User',
	email: 'test@example.com',
};

const sampleMedia = {
	title: 'Test Movie',
	magnetLink: 'magnet:?xt=urn:btih:abc',
	infohash: 'abc',
};

describe('Database Service', () => {
	let sqlite: Database.Database;
	let testDb: ReturnType<typeof drizzle>;
	let mediaDb: any;
	let seasonsDb: any;
	let episodesDb: any;
	let downloadsDb: any;

	beforeAll(async () => {
		// 1. Setup in-memory database
		sqlite = new Database(':memory:');
		testDb = drizzle(sqlite, { schema });

		// 2. Mock the db module
		vi.doMock('$lib/server/db/index', () => ({
			db: testDb,
		}));

		// 3. Import the service under test
		const dbModule = await import('$lib/server/db');
		mediaDb = dbModule.mediaDb;
		seasonsDb = dbModule.seasonsDb;
		episodesDb = dbModule.episodesDb;
		downloadsDb = dbModule.downloadsDb;

		// Create tables
		sqlite.exec(`
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
        last_played_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS seasons (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        season_number INTEGER NOT NULL,
        name TEXT,
        overview TEXT,
        poster_path TEXT,
        air_date TEXT,
        episode_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        magnet_link TEXT NOT NULL,
        infohash TEXT NOT NULL,
        status TEXT DEFAULT 'added',
        progress REAL DEFAULT 0,
        added_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        download_id TEXT REFERENCES downloads(id),
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
        created_at INTEGER DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
      );
      
      CREATE UNIQUE INDEX IF NOT EXISTS media_user_infohash_unique ON media(user_id, infohash);
      CREATE UNIQUE INDEX IF NOT EXISTS seasons_media_number_unique ON seasons(media_id, season_number);
      CREATE UNIQUE INDEX IF NOT EXISTS episodes_season_number_unique ON episodes(season_id, episode_number);
      CREATE UNIQUE INDEX IF NOT EXISTS downloads_media_infohash_unique ON downloads(media_id, infohash);
    `);
	});

	beforeEach(() => {
		// Clean up
		sqlite.exec('DELETE FROM episodes');
		sqlite.exec('DELETE FROM seasons');
		sqlite.exec('DELETE FROM downloads');
		sqlite.exec('DELETE FROM media');
		sqlite.exec('DELETE FROM user');

		// Insert user
		testDb.insert(schema.user).values(testUser).run();
	});

	// =========================================================================
	// Media Tests
	// =========================================================================
	describe('mediaDb', () => {
		it('create and get media', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				...sampleMedia,
				type: 'movie',
			});

			expect(created.id).toBeDefined();
			expect(created.status).toBe('added');

			const fetched = mediaDb.get(created.id, testUser.id);
			expect(fetched).toBeDefined();
			expect(fetched?.title).toBe(sampleMedia.title);
		});

		it('list media', () => {
			mediaDb.create({ userId: testUser.id, ...sampleMedia, infohash: '1' });
			mediaDb.create({ userId: testUser.id, ...sampleMedia, infohash: '2' });

			const list = mediaDb.list(testUser.id);
			expect(list).toHaveLength(2);
		});

		it('getByInfohash', () => {
			mediaDb.create({ userId: testUser.id, ...sampleMedia });
			const result = mediaDb.getByInfohash(sampleMedia.infohash, testUser.id);
			expect(result).toBeDefined();
		});

		it('updateProgress', () => {
			const created = mediaDb.create({ userId: testUser.id, ...sampleMedia });
			mediaDb.updateProgress(created.id, 50, 'downloading');
			const updated = mediaDb.getById(created.id);
			expect(updated?.progress).toBe(50);
			expect(updated?.status).toBe('downloading');
		});

		it('updateMetadata', () => {
			const created = mediaDb.create({ userId: testUser.id, ...sampleMedia });
			mediaDb.updateMetadata(created.id, {
				title: 'Updated Title',
				year: 2025,
				overview: 'New Overview',
			});
			const updated = mediaDb.getById(created.id);
			expect(updated?.title).toBe('Updated Title');
			expect(updated?.year).toBe(2025);
			expect(updated?.overview).toBe('New Overview');
		});

		it('delete media', () => {
			const created = mediaDb.create({ userId: testUser.id, ...sampleMedia });
			mediaDb.delete(created.id, testUser.id);
			const fetched = mediaDb.getById(created.id);
			expect(fetched).toBeUndefined();
		});

		it('resetDownload', () => {
			const created = mediaDb.create({ userId: testUser.id, ...sampleMedia });
			mediaDb.updateProgress(created.id, 100, 'complete');
			mediaDb.resetDownload(created.id);
			const updated = mediaDb.getById(created.id);
			expect(updated?.status).toBe('added');
			expect(updated?.progress).toBe(0);
		});
	});

	// =========================================================================
	// Season Tests
	// =========================================================================
	describe('seasonsDb', () => {
		let mediaId: string;

		beforeEach(() => {
			const m = mediaDb.create({ userId: testUser.id, ...sampleMedia, type: 'tv' });
			mediaId = m.id;
		});

		it('create and get season', () => {
			const season = seasonsDb.create({
				mediaId,
				seasonNumber: 1,
				name: 'Season 1',
			});

			expect(season.id).toBeDefined();

			const fetched = seasonsDb.getById(season.id);
			expect(fetched?.name).toBe('Season 1');

			const byNumber = seasonsDb.getByMediaAndNumber(mediaId, 1);
			expect(byNumber?.id).toBe(season.id);
		});

		it('getByMediaId', () => {
			seasonsDb.create({ mediaId, seasonNumber: 1 });
			seasonsDb.create({ mediaId, seasonNumber: 2 });

			const list = seasonsDb.getByMediaId(mediaId);
			expect(list).toHaveLength(2);
			expect(list[0].seasonNumber).toBe(1); // Ordered by number
		});

		it('updateEpisodeCount', () => {
			const season = seasonsDb.create({ mediaId, seasonNumber: 1 });
			seasonsDb.updateEpisodeCount(season.id, 10);
			const updated = seasonsDb.getById(season.id);
			expect(updated?.episodeCount).toBe(10);
		});

		it('deleteByMediaId', () => {
			seasonsDb.create({ mediaId, seasonNumber: 1 });
			seasonsDb.deleteByMediaId(mediaId);
			const list = seasonsDb.getByMediaId(mediaId);
			expect(list).toHaveLength(0);
		});
	});

	// =========================================================================
	// Download Tests
	// =========================================================================
	describe('downloadsDb', () => {
		let mediaId: string;

		beforeEach(() => {
			const m = mediaDb.create({ userId: testUser.id, ...sampleMedia, type: 'tv' });
			mediaId = m.id;
		});

		it('create and get download', () => {
			const dl = downloadsDb.create({
				mediaId,
				magnetLink: 'magnet:?xt=urn:btih:111',
				infohash: '111',
			});

			expect(dl.id).toBeDefined();

			const fetched = downloadsDb.getById(dl.id);
			expect(fetched?.infohash).toBe('111');

			const byInfohash = downloadsDb.getByInfohash(mediaId, '111');
			expect(byInfohash?.id).toBe(dl.id);
		});

		it('updateProgress', () => {
			const dl = downloadsDb.create({
				mediaId,
				magnetLink: 'magnet:...',
				infohash: '111',
			});
			downloadsDb.updateProgress(dl.id, 50, 'downloading');
			const updated = downloadsDb.getById(dl.id);
			expect(updated?.progress).toBe(50);
			expect(updated?.status).toBe('downloading');
		});

		it('infohashExistsForUser', () => {
			downloadsDb.create({
				mediaId,
				magnetLink: 'magnet:...',
				infohash: '111',
			});
			const exists = downloadsDb.infohashExistsForUser('111', testUser.id);
			expect(exists).toBeDefined();
			expect(exists?.media.id).toBe(mediaId);
		});
	});

	// =========================================================================
	// Episode Tests
	// =========================================================================
	describe('episodesDb', () => {
		let mediaId: string;
		let seasonId: string;
		let downloadId: string;

		beforeEach(() => {
			const m = mediaDb.create({ userId: testUser.id, ...sampleMedia, type: 'tv' });
			mediaId = m.id;
			const s = seasonsDb.create({ mediaId, seasonNumber: 1 });
			seasonId = s.id;
			const d = downloadsDb.create({ mediaId, magnetLink: '...', infohash: '111' });
			downloadId = d.id;
		});

		it('create and get episode', () => {
			const ep = episodesDb.create({
				seasonId,
				episodeNumber: 1,
				displayOrder: 1,
				title: 'Pilot',
			});

			expect(ep.id).toBeDefined();

			const fetched = episodesDb.getById(ep.id);
			expect(fetched?.title).toBe('Pilot');

			const byNumber = episodesDb.getBySeasonAndNumber(seasonId, 1);
			expect(byNumber?.id).toBe(ep.id);
		});

		it('createMany', () => {
			episodesDb.createMany([
				{ seasonId, episodeNumber: 1, displayOrder: 1, title: 'Ep1' },
				{ seasonId, episodeNumber: 2, displayOrder: 2, title: 'Ep2' },
			]);

			const list = episodesDb.getBySeasonId(seasonId);
			expect(list).toHaveLength(2);
		});

		it('updateFileInfo', () => {
			const ep = episodesDb.create({ seasonId, episodeNumber: 1, displayOrder: 1 });
			episodesDb.updateFileInfo(ep.id, 0, '/path/file.mkv', 1000);
			const updated = episodesDb.getById(ep.id);
			expect(updated?.filePath).toBe('/path/file.mkv');
			expect(updated?.fileSize).toBe(1000);
		});

		it('updateProgress', () => {
			const ep = episodesDb.create({ seasonId, episodeNumber: 1, displayOrder: 1 });
			episodesDb.updateProgress(ep.id, 500, 'downloading');
			const updated = episodesDb.getById(ep.id);
			expect(updated?.downloadedBytes).toBe(500);
			expect(updated?.status).toBe('downloading');
		});

		it('bulkUpdateDisplayOrder', () => {
			const ep1 = episodesDb.create({ seasonId, episodeNumber: 1, displayOrder: 1 });
			const ep2 = episodesDb.create({ seasonId, episodeNumber: 2, displayOrder: 2 });

			episodesDb.bulkUpdateDisplayOrder([
				{ id: ep1.id, displayOrder: 2 },
				{ id: ep2.id, displayOrder: 1 },
			]);

			const updated1 = episodesDb.getById(ep1.id);
			const updated2 = episodesDb.getById(ep2.id);

			expect(updated1?.displayOrder).toBe(2);
			expect(updated2?.displayOrder).toBe(1);
		});

		it('getByMediaId', () => {
			episodesDb.create({ seasonId, episodeNumber: 1, displayOrder: 1 });
			const results = episodesDb.getByMediaId(mediaId);
			expect(results).toHaveLength(1);
			expect(results[0].season.mediaId).toBe(mediaId);
		});

		it('getByDownloadId', () => {
			episodesDb.create({ seasonId, episodeNumber: 1, displayOrder: 1, downloadId });
			const results = episodesDb.getByDownloadId(downloadId);
			expect(results).toHaveLength(1);
		});
	});
});
