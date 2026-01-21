import { describe, it, expect, beforeEach } from 'vitest';
import { db, testDb } from './setup';
import * as schema from '$lib/server/db/schema';
import { movies } from '$lib/server/db';
import { parseMagnet } from '$lib/server/magnet';

// Helper to simulate API context
interface Locals {
  user: { id: string; name: string; email: string } | null;
}

// Mock the handlers since we can't easily import +server.ts files directly in all testing setups
// without a full SvelteKit environment. However, for unit/integration testing the logic,
// we can test the `movies` db module and potential helper functions, 
// OR we can try to structure the route handlers to be testable functions.
//
// In api.test.ts, the previous dev mocked the handlers by copying logic. 
// A better approach for "extensive tests" of the *backend logic* is to test the 
// service layer (db.ts, storage.ts) thoroughly, and then test the route handlers 
// if they are exported as independent functions.
//
// Since SvelteKit +server.ts exports GET/POST functions, we can import them if we map aliases correctly.
// Let's rely on the DB layer tests for data integrity and logic, which seems to be what `api.test.ts` was doing mostly.

// Real magnet link for testing
const REAL_MAGNET = 'magnet:?xt=urn:btih:C39FE3EEFBDB62DA9C27EB6398FF4A7D2E26E7AB&dn=Big.Buck.Bunny.BDRip.XviD-MEDiC&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337';
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

describe('Movies API / DB Logic', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM movies');
    testDb.exec('DELETE FROM user');
    db.insert(schema.user).values(testUser).run();
    db.insert(schema.user).values(testUser2).run();
  });

  describe('Core Movie Operations', () => {
    it('should create a movie', () => {
      const created = movies.create({
        userId: testUser.id,
        title: 'Test Movie',
        magnetLink: REAL_MAGNET,
        infohash: REAL_INFOHASH,
      });

      expect(created.id).toBeDefined();
      expect(created.title).toBe('Test Movie');
      expect(created.status).toBe('added');
      
      const fetched = movies.get(created.id, testUser.id);
      expect(fetched).toBeDefined();
      expect(fetched?.title).toBe('Test Movie');
    });

    it('should not allow duplicate magnet links for the same user', () => {
        movies.create({
            userId: testUser.id,
            title: 'Test Movie',
            magnetLink: REAL_MAGNET,
            infohash: REAL_INFOHASH,
        });

        expect(() => {
            movies.create({
                userId: testUser.id,
                title: 'Test Movie Copy',
                magnetLink: REAL_MAGNET,
                infohash: REAL_INFOHASH,
            });
        }).toThrow(/UNIQUE constraint failed/);
    });

    it('should allow same magnet for different users', () => {
        movies.create({
            userId: testUser.id,
            title: 'Test Movie',
            magnetLink: REAL_MAGNET,
            infohash: REAL_INFOHASH,
        });

        expect(() => {
            movies.create({
                userId: testUser2.id,
                title: 'Test Movie 2',
                magnetLink: REAL_MAGNET,
                infohash: REAL_INFOHASH,
            });
        }).not.toThrow();
    });

    it('should update progress', () => {
        const created = movies.create({
            userId: testUser.id,
            title: 'Test Movie',
            magnetLink: REAL_MAGNET,
            infohash: REAL_INFOHASH,
        });

        movies.updateProgress(created.id, 0.5, 'downloading');
        let fetched = movies.get(created.id, testUser.id);
        expect(fetched?.progress).toBe(0.5);
        expect(fetched?.status).toBe('downloading');

        movies.updateProgress(created.id, 1, 'complete');
        fetched = movies.get(created.id, testUser.id);
        expect(fetched?.progress).toBe(1);
        expect(fetched?.status).toBe('complete');
    });

    it('should update metadata', () => {
        const created = movies.create({
            userId: testUser.id,
            title: 'Test Movie',
            magnetLink: REAL_MAGNET,
            infohash: REAL_INFOHASH,
        });

        movies.updateMetadata(created.id, {
            overview: 'Updated overview',
            year: 2025,
            runtime: 120,
            certification: 'PG-13'
        });

        const fetched = movies.get(created.id, testUser.id);
        expect(fetched?.overview).toBe('Updated overview');
        expect(fetched?.year).toBe(2025);
        expect(fetched?.runtime).toBe(120);
        expect(fetched?.certification).toBe('PG-13');
    });

    it('should update file path', () => {
        const created = movies.create({
            userId: testUser.id,
            title: 'Test Movie',
            magnetLink: REAL_MAGNET,
            infohash: REAL_INFOHASH,
        });

        movies.updateFilePath(created.id, '/path/to/file.mp4', 1024);
        const fetched = movies.get(created.id, testUser.id);
        expect(fetched?.filePath).toBe('/path/to/file.mp4');
        expect(fetched?.fileSize).toBe(1024);
        expect(fetched?.status).toBe('complete');
    });

    it('should soft delete locally (db remove only)', () => {
        const created = movies.create({
            userId: testUser.id,
            title: 'Test Movie',
            magnetLink: REAL_MAGNET,
            infohash: REAL_INFOHASH,
        });

        movies.delete(created.id, testUser.id);
        const fetched = movies.get(created.id, testUser.id);
        expect(fetched).toBeUndefined();
    });
  });

  describe('Isolation', () => {
      it('should list only user movies', () => {
        movies.create({ userId: testUser.id, title: 'U1', magnetLink: 'm1', infohash: 'h1' });
        movies.create({ userId: testUser.id, title: 'U1_2', magnetLink: 'm2', infohash: 'h2' });
        movies.create({ userId: testUser2.id, title: 'U2', magnetLink: 'm3', infohash: 'h3' });

        const list1 = movies.list(testUser.id);
        expect(list1).toHaveLength(2);
        
        const list2 = movies.list(testUser2.id);
        expect(list2).toHaveLength(1);
      });
  });
});
