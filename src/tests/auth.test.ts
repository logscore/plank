import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, testDb } from './setup';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Mocking BetterAuth concepts?
// BetterAuth is likely an external library or our own wrapper. 
// Given the schema, we can test the session logic if we had access to the auth service.
// However, looking at hooks.server.ts, it uses `auth.api.getSession`.
// We should test the schema constraints and perhaps simulate what auth does.

describe('Auth / User Schema', () => {
    beforeEach(() => {
        testDb.exec('DELETE FROM user');
        testDb.exec('DELETE FROM session');
    });

    it('should create a user', () => {
        const user = {
            id: 'u1',
            name: 'User 1',
            email: 'u1@example.com',
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        db.insert(schema.user).values(user).run();
        
        const fetched = db.select().from(schema.user).where(eq(schema.user.id, 'u1')).get();
        expect(fetched?.email).toBe('u1@example.com');
    });

    it('should enforce unique email', () => {
        const user1 = {
            id: 'u1',
            name: 'User 1',
            email: 'unique@example.com',
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        db.insert(schema.user).values(user1).run();

        const user2 = {
            id: 'u2',
            name: 'User 2',
            email: 'unique@example.com', // Duplicate
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        expect(() => {
            db.insert(schema.user).values(user2).run();
        }).toThrow(/UNIQUE constraint failed/);
    });

    it('should cascade delete sessions when user is deleted', () => {
        const user = {
            id: 'u1',
            name: 'User 1',
            email: 'u1@example.com',
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        db.insert(schema.user).values(user).run();

        const session = {
            id: 's1',
            userId: 'u1',
            token: 't1',
            expiresAt: new Date(Date.now() + 10000),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        db.insert(schema.session).values(session).run();

        // Verify session exists
        let ses = db.select().from(schema.session).where(eq(schema.session.id, 's1')).get();
        expect(ses).toBeDefined();

        // Delete user
        db.delete(schema.user).where(eq(schema.user.id, 'u1')).run();

        // Verify session gone
        ses = db.select().from(schema.session).where(eq(schema.session.id, 's1')).get();
        expect(ses).toBeUndefined();
    });
});
