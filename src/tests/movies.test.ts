import { beforeEach, describe, expect, it } from 'vitest';
import { mediaDb } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { db, testDb } from './setup';

// Helper to simulate API context
interface Locals {
	user: { id: string; name: string; email: string } | null;
}

// Real magnet link for testing
const REAL_MAGNET =
	'magnet:?xt=urn:btih:C39FE3EEFBDB62DA9C27EB6398FF4A7D2E26E7AB&dn=Big.Buck.Bunny.BDRip.XviD-MEDiC&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337';
const REAL_INFOHASH = 'c39fe3eefbdb62da9c27eb6398ff4a7d2e26e7ab';

const testUser = {
	id: 'test-user-123',
	name: 'Test User',
	email: 'test@example.com',
	emailVerified: false,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const testUser2 = {
	id: 'test-user-456',
	name: 'Other User',
	email: 'other@example.com',
	emailVerified: false,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const testOrg = {
	id: 'org-1',
	name: 'Test Org',
	slug: 'test-org',
	createdAt: new Date(),
	updatedAt: new Date(),
};

const testOrg2 = {
	id: 'org-2',
	name: 'Other Org',
	slug: 'other-org',
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe('Media API / DB Logic', () => {
	beforeEach(() => {
		testDb.exec('DELETE FROM episodes');
		testDb.exec('DELETE FROM seasons');
		testDb.exec('DELETE FROM media');
		testDb.exec('DELETE FROM organization');
		testDb.exec('DELETE FROM user');
		db.insert(schema.user).values(testUser).run();
		db.insert(schema.user).values(testUser2).run();
		db.insert(schema.organization).values(testOrg).run();
		db.insert(schema.organization).values(testOrg2).run();
	});

	describe('Core Media Operations', () => {
		it('should create media', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Test Movie',
				magnetLink: REAL_MAGNET,
				infohash: REAL_INFOHASH,
				type: 'movie',
			});

			expect(created.id).toBeDefined();
			expect(created.title).toBe('Test Movie');
			expect(created.status).toBe('added');
			expect(created.type).toBe('movie');

			const fetched = mediaDb.get(created.id, testUser.id);
			expect(fetched).toBeDefined();
			expect(fetched?.title).toBe('Test Movie');
		});

		it('should not allow duplicate magnet links for the same user', () => {
			mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Test Movie',
				magnetLink: REAL_MAGNET,
				infohash: REAL_INFOHASH,
				type: 'movie',
			});

			expect(() => {
				mediaDb.create({
					userId: testUser.id,
					organizationId: testOrg.id,
					title: 'Test Movie Copy',
					magnetLink: REAL_MAGNET,
					infohash: REAL_INFOHASH,
					type: 'movie',
				});
			}).toThrow(/UNIQUE constraint failed/);
		});

		it('should allow same magnet for different users', () => {
			mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Test Movie',
				magnetLink: REAL_MAGNET,
				infohash: REAL_INFOHASH,
				type: 'movie',
			});

			expect(() => {
				mediaDb.create({
					userId: testUser2.id,
					organizationId: testOrg2.id,
					title: 'Test Movie 2',
					magnetLink: REAL_MAGNET,
					infohash: REAL_INFOHASH,
					type: 'movie',
				});
			}).not.toThrow();
		});

		it('should update progress', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Test Movie',
				magnetLink: REAL_MAGNET,
				infohash: REAL_INFOHASH,
				type: 'movie',
			});

			mediaDb.updateProgress(created.id, 0.5, 'downloading');
			let fetched = mediaDb.get(created.id, testUser.id);
			expect(fetched?.progress).toBe(0.5);
			expect(fetched?.status).toBe('downloading');

			mediaDb.updateProgress(created.id, 1, 'complete');
			fetched = mediaDb.get(created.id, testUser.id);
			expect(fetched?.progress).toBe(1);
			expect(fetched?.status).toBe('complete');
		});

		it('should update metadata', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Test Movie',
				magnetLink: REAL_MAGNET,
				infohash: REAL_INFOHASH,
				type: 'movie',
			});

			mediaDb.updateMetadata(created.id, {
				overview: 'Updated overview',
				year: 2025,
				runtime: 120,
				certification: 'PG-13',
			});

			const fetched = mediaDb.get(created.id, testUser.id);
			expect(fetched?.overview).toBe('Updated overview');
			expect(fetched?.year).toBe(2025);
			expect(fetched?.runtime).toBe(120);
			expect(fetched?.certification).toBe('PG-13');
		});

		it('should update file path', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Test Movie',
				magnetLink: REAL_MAGNET,
				infohash: REAL_INFOHASH,
				type: 'movie',
			});

			mediaDb.updateFilePath(created.id, '/path/to/file.mp4', 1024);
			const fetched = mediaDb.get(created.id, testUser.id);
			expect(fetched?.filePath).toBe('/path/to/file.mp4');
			expect(fetched?.fileSize).toBe(1024);
			expect(fetched?.status).toBe('complete');
		});

		it('should delete media', () => {
			const created = mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Test Movie',
				magnetLink: REAL_MAGNET,
				infohash: REAL_INFOHASH,
				type: 'movie',
			});

			mediaDb.delete(created.id, testUser.id);
			const fetched = mediaDb.get(created.id, testUser.id);
			expect(fetched).toBeUndefined();
		});
	});

	describe('Isolation', () => {
		it('should list only user media', () => {
			mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'U1',
				magnetLink: 'm1',
				infohash: 'h1',
				type: 'movie',
			});
			mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'U1_2',
				magnetLink: 'm2',
				infohash: 'h2',
				type: 'movie',
			});
			mediaDb.create({
				userId: testUser2.id,
				organizationId: testOrg2.id,
				title: 'U2',
				magnetLink: 'm3',
				infohash: 'h3',
				type: 'movie',
			});

			const list1 = mediaDb.list(testOrg.id);
			expect(list1).toHaveLength(2);

			const list2 = mediaDb.list(testOrg2.id);
			expect(list2).toHaveLength(1);
		});

		it('should filter by type', () => {
			mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'Movie 1',
				magnetLink: 'm1',
				infohash: 'h1',
				type: 'movie',
			});
			mediaDb.create({
				userId: testUser.id,
				organizationId: testOrg.id,
				title: 'TV Show 1',
				magnetLink: 'm2',
				infohash: 'h2',
				type: 'tv',
			});

			const movies = mediaDb.list(testOrg.id, 'movie');
			expect(movies).toHaveLength(1);
			expect(movies[0].title).toBe('Movie 1');

			const shows = mediaDb.list(testOrg.id, 'tv');
			expect(shows).toHaveLength(1);
			expect(shows[0].title).toBe('TV Show 1');

			const all = mediaDb.list(testOrg.id);
			expect(all).toHaveLength(2);
		});
	});
});
