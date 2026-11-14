import { beforeEach, describe, expect, it } from "vitest";
import { mediaDb, seasonsDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { POST as markWatchedRoute } from "../routes/api/media/[id]/watched/+server";
import { db } from "./setup";

const testUser = {
	email: "media@example.com",
	emailVerified: true,
	id: "media-user",
	name: "Media User",
};

const testOrg = {
	createdAt: new Date(),
	id: "media-org",
	name: "Media Org",
	slug: "media-org",
};

beforeEach(() => {
	db.insert(schema.user).values(testUser).run();
	db.insert(schema.organization).values(testOrg).run();
});

function createShowHierarchy() {
	const show = mediaDb.create({
		organizationId: testOrg.id,
		title: "Unified Show",
		totalSeasons: 1,
		type: "show",
		userId: testUser.id,
	});
	const season = seasonsDb.create({
		episodeCount: 2,
		mediaId: show.id,
		name: "Season 1",
		seasonNumber: 1,
	});
	const episodeA = mediaDb.create({
		displayOrder: 0,
		episodeNumber: 1,
		organizationId: testOrg.id,
		parentId: show.id,
		seasonId: season.id,
		seasonNumber: 1,
		status: "pending",
		title: "Pilot",
		type: "episode",
		userId: testUser.id,
	});
	const episodeB = mediaDb.create({
		displayOrder: 1,
		episodeNumber: 2,
		organizationId: testOrg.id,
		parentId: show.id,
		seasonId: season.id,
		seasonNumber: 1,
		status: "pending",
		title: "Second Episode",
		type: "episode",
		userId: testUser.id,
	});
	return { episodeA, episodeB, season, show };
}

describe("unified media model", () => {
	it("returns season episodes in display order", () => {
		const { season, episodeA, episodeB } = createShowHierarchy();
		expect(mediaDb.getEpisodesBySeasonId(season.id).map((item) => item.id)).toEqual([episodeA.id, episodeB.id]);
	});

	it("resolves the next episode within the same season", () => {
		const { episodeA, episodeB } = createShowHierarchy();
		expect(mediaDb.getNextEpisodeById(episodeA.id)?.id).toBe(episodeB.id);
	});

	it("resolves the next episode across a season boundary", () => {
		const show = mediaDb.create({
			organizationId: testOrg.id,
			title: "Boundary Show",
			totalSeasons: 2,
			type: "show",
			userId: testUser.id,
		});
		const seasonOne = seasonsDb.create({
			episodeCount: 2,
			mediaId: show.id,
			name: "Season 1",
			seasonNumber: 1,
		});
		const seasonTwo = seasonsDb.create({
			episodeCount: 1,
			mediaId: show.id,
			name: "Season 2",
			seasonNumber: 2,
		});

		const finalePartOne = mediaDb.create({
			displayOrder: 0,
			episodeNumber: 1,
			organizationId: testOrg.id,
			parentId: show.id,
			seasonId: seasonOne.id,
			seasonNumber: 1,
			status: "pending",
			title: "Episode 1",
			type: "episode",
			userId: testUser.id,
		});
		const finalePartTwo = mediaDb.create({
			displayOrder: 1,
			episodeNumber: 2,
			organizationId: testOrg.id,
			parentId: show.id,
			seasonId: seasonOne.id,
			seasonNumber: 1,
			status: "pending",
			title: "Episode 2",
			type: "episode",
			userId: testUser.id,
		});
		const seasonTwoPremiere = mediaDb.create({
			displayOrder: 0,
			episodeNumber: 1,
			organizationId: testOrg.id,
			parentId: show.id,
			seasonId: seasonTwo.id,
			seasonNumber: 2,
			status: "pending",
			title: "Season 2 Premiere",
			type: "episode",
			userId: testUser.id,
		});

		expect(mediaDb.getNextEpisodeById(finalePartOne.id)?.id).toBe(finalePartTwo.id);
		expect(mediaDb.getNextEpisodeById(finalePartTwo.id)?.id).toBe(seasonTwoPremiere.id);
	});

	it("returns no next episode for the final episode", () => {
		const show = mediaDb.create({
			organizationId: testOrg.id,
			title: "Finale Show",
			type: "show",
			userId: testUser.id,
		});
		const season = seasonsDb.create({
			episodeCount: 1,
			mediaId: show.id,
			name: "Season 1",
			seasonNumber: 1,
		});
		const finale = mediaDb.create({
			displayOrder: 0,
			episodeNumber: 1,
			organizationId: testOrg.id,
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			status: "pending",
			title: "Finale",
			type: "episode",
			userId: testUser.id,
		});

		expect(mediaDb.getNextEpisodeById(finale.id)).toBeNull();
	});

	it("respects display order when determining the next episode", () => {
		const show = mediaDb.create({
			organizationId: testOrg.id,
			title: "Reordered Show",
			type: "show",
			userId: testUser.id,
		});
		const season = seasonsDb.create({
			episodeCount: 3,
			mediaId: show.id,
			name: "Season 1",
			seasonNumber: 1,
		});
		const firstByDisplayOrder = mediaDb.create({
			displayOrder: 0,
			episodeNumber: 2,
			organizationId: testOrg.id,
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			status: "pending",
			title: "Second Numbered Episode",
			type: "episode",
			userId: testUser.id,
		});
		const secondByDisplayOrder = mediaDb.create({
			displayOrder: 1,
			episodeNumber: 3,
			organizationId: testOrg.id,
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			status: "pending",
			title: "Third Numbered Episode",
			type: "episode",
			userId: testUser.id,
		});
		const lastByDisplayOrder = mediaDb.create({
			displayOrder: 2,
			episodeNumber: 1,
			organizationId: testOrg.id,
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			status: "pending",
			title: "First Numbered Episode",
			type: "episode",
			userId: testUser.id,
		});

		expect(mediaDb.getNextEpisodeById(firstByDisplayOrder.id)?.id).toBe(secondByDisplayOrder.id);
		expect(mediaDb.getNextEpisodeById(secondByDisplayOrder.id)?.id).toBe(lastByDisplayOrder.id);
	});

	it("finds an episode by parent show and numbering", () => {
		const { show, episodeA } = createShowHierarchy();
		const episode = mediaDb.getEpisodeByParentAndNumber(show.id, 1, 1);
		expect(episode?.id).toBe(episodeA.id);
	});

	it("tracks continue watching on episode rows", () => {
		const { episodeA } = createShowHierarchy();
		mediaDb.updatePlayPosition(episodeA.id, 120, 1800);
		mediaDb.updateLastPlayed(episodeA.id);
		const recentlyWatched = mediaDb.getRecentlyWatched(testOrg.id);
		expect(recentlyWatched.map((item) => item.id)).toContain(episodeA.id);
	});

	it("drops a marked-watched episode with a known duration from continue watching", () => {
		const { episodeA } = createShowHierarchy();
		mediaDb.updatePlayPosition(episodeA.id, 120, 1800);
		mediaDb.updateLastPlayed(episodeA.id);
		mediaDb.markWatched(episodeA.id);
		expect(mediaDb.getById(episodeA.id)?.playPosition).toBe(1800);
		expect(mediaDb.getRecentlyWatched(testOrg.id).map((item) => item.id)).not.toContain(episodeA.id);
	});

	it("drops a marked-watched episode without a duration from continue watching", () => {
		const { episodeA } = createShowHierarchy();
		mediaDb.updatePlayPosition(episodeA.id, 120);
		mediaDb.updateLastPlayed(episodeA.id);
		expect(mediaDb.getRecentlyWatched(testOrg.id).map((item) => item.id)).toContain(episodeA.id);
		mediaDb.markWatched(episodeA.id);
		expect(mediaDb.getById(episodeA.id)?.playPosition).toBe(0);
		expect(mediaDb.getRecentlyWatched(testOrg.id).map((item) => item.id)).not.toContain(episodeA.id);
	});

	it("marks watched through the API route", async () => {
		const { episodeA } = createShowHierarchy();
		mediaDb.updatePlayPosition(episodeA.id, 120, 1800);
		mediaDb.updateLastPlayed(episodeA.id);
		const locals = {
			session: { activeOrganizationId: testOrg.id },
			user: { id: testUser.id },
		} as unknown as App.Locals;

		const response = await markWatchedRoute({ locals, params: { id: episodeA.id } } as never);

		expect(response.status).toBe(204);
		expect(mediaDb.getRecentlyWatched(testOrg.id).map((item) => item.id)).not.toContain(episodeA.id);
	});

	it("cascades show deletion to seasons and episodes", () => {
		const { show, season } = createShowHierarchy();
		mediaDb.delete(show.id, testOrg.id);
		expect(seasonsDb.getById(season.id)).toBeUndefined();
		expect(mediaDb.getEpisodesByParentId(show.id)).toEqual([]);
	});
});
