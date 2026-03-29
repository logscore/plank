import { beforeEach, describe, expect, it } from 'vitest';
import { mediaDb, seasonsDb } from '$lib/server/db';
import { schema } from '$lib/server/db/schema';
import { db } from './setup';

const testUser = {
	id: 'media-user',
	name: 'Media User',
	email: 'media@example.com',
	emailVerified: true,
};

const testOrg = {
	id: 'media-org',
	name: 'Media Org',
	slug: 'media-org',
};

beforeEach(() => {
	db.insert(schema.user).values(testUser).run();
	db.insert(schema.organization).values(testOrg).run();
});

function createShowHierarchy() {
	const show = mediaDb.create({
		userId: testUser.id,
		organizationId: testOrg.id,
		type: 'show',
		title: 'Unified Show',
		totalSeasons: 1,
	});
	const season = seasonsDb.create({
		mediaId: show.id,
		seasonNumber: 1,
		name: 'Season 1',
		episodeCount: 2,
	});
	const episodeA = mediaDb.create({
		userId: testUser.id,
		organizationId: testOrg.id,
		type: 'episode',
		parentId: show.id,
		seasonId: season.id,
		seasonNumber: 1,
		episodeNumber: 1,
		displayOrder: 0,
		title: 'Pilot',
		status: 'pending',
	});
	const episodeB = mediaDb.create({
		userId: testUser.id,
		organizationId: testOrg.id,
		type: 'episode',
		parentId: show.id,
		seasonId: season.id,
		seasonNumber: 1,
		episodeNumber: 2,
		displayOrder: 1,
		title: 'Second Episode',
		status: 'pending',
	});
	return { show, season, episodeA, episodeB };
}

describe('unified media model', () => {
	it('returns season episodes in display order', () => {
		const { season, episodeA, episodeB } = createShowHierarchy();
		expect(mediaDb.getEpisodesBySeasonId(season.id).map((item) => item.id)).toEqual([episodeA.id, episodeB.id]);
	});

	it('finds an episode by parent show and numbering', () => {
		const { show, episodeA } = createShowHierarchy();
		const episode = mediaDb.getEpisodeByParentAndNumber(show.id, 1, 1);
		expect(episode?.id).toBe(episodeA.id);
	});

	it('supports reordering episode media rows', () => {
		const { season, episodeA, episodeB } = createShowHierarchy();
		mediaDb.bulkUpdateDisplayOrder([
			{ id: episodeA.id, displayOrder: 2 },
			{ id: episodeB.id, displayOrder: 0 },
		]);
		expect(mediaDb.getEpisodesBySeasonId(season.id).map((item) => item.id)).toEqual([episodeB.id, episodeA.id]);
	});

	it('tracks continue watching on episode rows', () => {
		const { episodeA } = createShowHierarchy();
		mediaDb.updatePlayPosition(episodeA.id, 120, 1800);
		mediaDb.updateLastPlayed(episodeA.id);
		const recentlyWatched = mediaDb.getRecentlyWatched(testOrg.id);
		expect(recentlyWatched.map((item) => item.id)).toContain(episodeA.id);
	});

	it('cascades show deletion to seasons and episodes', () => {
		const { show, season } = createShowHierarchy();
		mediaDb.delete(show.id, testOrg.id);
		expect(seasonsDb.getById(season.id)).toBeUndefined();
		expect(mediaDb.getEpisodesByParentId(show.id)).toEqual([]);
	});
});
