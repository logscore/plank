import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '../routes/api/search/+server';
import { movies } from '$lib/server/db';
import { testDb, db } from './setup';
import * as schema from '$lib/server/db/schema';

// Helper to simulate request
function createRequest(url: string, user: any) {
    return {
        url: new URL(url, 'http://localhost'),
        locals: { user }
    };
}

const testUser = {
  id: 'test-user-123',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Search API', () => {
    beforeEach(() => {
        testDb.exec('DELETE FROM movies');
        testDb.exec('DELETE FROM movies_fts'); // Ensure FTS is clean
        testDb.exec('DELETE FROM user');
        db.insert(schema.user).values(testUser).run();
    });

    it('should return 401 if not authorized', async () => {
        const req = createRequest('/api/search?q=test', null);
        const res = await GET(req as any);
        expect(res.status).toBe(401);
    });

    it('should return empty array for short queries', async () => {
        const req = createRequest('/api/search?q=a', testUser);
        const res = await GET(req as any);
        const data = await res.json();
        expect(data).toEqual([]);
    });

    it('should search by title using FTS', async () => {
        movies.create({
            userId: testUser.id,
            title: 'Matrix Reloaded',
            magnetLink: 'magnet:?xt=urn:btih:1',
            infohash: '1',
            overview: 'Neo returns'
        });

        movies.create({
            userId: testUser.id,
            title: 'Star Wars',
            magnetLink: 'magnet:?xt=urn:btih:2',
            infohash: '2',
            overview: 'Space opera'
        });

        // Search match
        const req = createRequest('/api/search?q=Matrix', testUser);
        const res = await GET(req as any);
        const data = await res.json();
        
        expect(res.status).toBe(200);
        expect(data).toHaveLength(1);
        expect(data[0].title).toBe('Matrix Reloaded');
    });

    it('should search by overview using FTS', async () => {
        movies.create({
            userId: testUser.id,
            title: 'Test Movie',
            magnetLink: 'magnet:?xt=urn:btih:1',
            infohash: '1',
            overview: 'Contains hidden keyword'
        });

        const req = createRequest('/api/search?q=hidden', testUser);
        const res = await GET(req as any);
        const data = await res.json();
        
        expect(data).toHaveLength(1);
        expect(data[0].title).toBe('Test Movie');
    });

    it('should respect user isolation', async () => {
        db.insert(schema.user).values({
            ...testUser,
            id: 'other-user',
            email: 'other@example.com'
        }).run();

        movies.create({
            userId: 'other-user', // Different user
            title: 'Secret User Movie',
            magnetLink: 'magnet:?xt=urn:btih:1',
            infohash: '1',
        });

        const req = createRequest('/api/search?q=Secret', testUser);
        const res = await GET(req as any);
        const data = await res.json();
        
        expect(data).toHaveLength(0);
    });
});
