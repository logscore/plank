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

	it('resolves the next episode within the same season', () => {
		const { episodeA, episodeB } = createShowHierarchy();
		expect(mediaDb.getNextEpisodeById(episodeA.id)?.id).toBe(episodeB.id);
	});

	it('resolves the next episode across a season boundary', () => {
		const show = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'show',
			title: 'Boundary Show',
			totalSeasons: 2,
		});
		const seasonOne = seasonsDb.create({
			mediaId: show.id,
			seasonNumber: 1,
			name: 'Season 1',
			episodeCount: 2,
		});
		const seasonTwo = seasonsDb.create({
			mediaId: show.id,
			seasonNumber: 2,
			name: 'Season 2',
			episodeCount: 1,
		});

		const finalePartOne = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'episode',
			parentId: show.id,
			seasonId: seasonOne.id,
			seasonNumber: 1,
			episodeNumber: 1,
			displayOrder: 0,
			title: 'Episode 1',
			status: 'pending',
		});
		const finalePartTwo = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'episode',
			parentId: show.id,
			seasonId: seasonOne.id,
			seasonNumber: 1,
			episodeNumber: 2,
			displayOrder: 1,
			title: 'Episode 2',
			status: 'pending',
		});
		const seasonTwoPremiere = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'episode',
			parentId: show.id,
			seasonId: seasonTwo.id,
			seasonNumber: 2,
			episodeNumber: 1,
			displayOrder: 0,
			title: 'Season 2 Premiere',
			status: 'pending',
		});

		expect(mediaDb.getNextEpisodeById(finalePartOne.id)?.id).toBe(finalePartTwo.id);
		expect(mediaDb.getNextEpisodeById(finalePartTwo.id)?.id).toBe(seasonTwoPremiere.id);
	});

	it('returns no next episode for the final episode', () => {
		const show = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'show',
			title: 'Finale Show',
		});
		const season = seasonsDb.create({
			mediaId: show.id,
			seasonNumber: 1,
			name: 'Season 1',
			episodeCount: 1,
		});
		const finale = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'episode',
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			episodeNumber: 1,
			displayOrder: 0,
			title: 'Finale',
			status: 'pending',
		});

		expect(mediaDb.getNextEpisodeById(finale.id)).toBeNull();
	});

	it('respects display order when determining the next episode', () => {
		const show = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'show',
			title: 'Reordered Show',
		});
		const season = seasonsDb.create({
			mediaId: show.id,
			seasonNumber: 1,
			name: 'Season 1',
			episodeCount: 3,
		});
		const firstByDisplayOrder = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'episode',
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			episodeNumber: 2,
			displayOrder: 0,
			title: 'Second Numbered Episode',
			status: 'pending',
		});
		const secondByDisplayOrder = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'episode',
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			episodeNumber: 3,
			displayOrder: 1,
			title: 'Third Numbered Episode',
			status: 'pending',
		});
		const lastByDisplayOrder = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: 'episode',
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			episodeNumber: 1,
			displayOrder: 2,
			title: 'First Numbered Episode',
			status: 'pending',
		});

		expect(mediaDb.getNextEpisodeById(firstByDisplayOrder.id)?.id).toBe(secondByDisplayOrder.id);
		expect(mediaDb.getNextEpisodeById(secondByDisplayOrder.id)?.id).toBe(lastByDisplayOrder.id);
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
