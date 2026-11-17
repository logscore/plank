import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CATALOG_FILTERS } from "$lib/data/search";
import { downloadsDb, mediaDb, seasonsDb, subtitlesDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { db } from "./setup";

const testUser = {
	email: "test@example.com",
	emailVerified: true,
	id: "user-1",
	name: "Test User",
};

const testOrg = {
	createdAt: new Date(),
	id: "org-1",
	name: "Test Org",
	slug: "test-org",
};

function createMovie() {
	return mediaDb.create({
		infohash: "movie123",
		magnetLink: "magnet:?xt=urn:btih:movie123",
		organizationId: testOrg.id,
		title: "Test Movie",
		type: "movie",
		userId: testUser.id,
	});
}

function createShow() {
	return mediaDb.create({
		organizationId: testOrg.id,
		title: "Test Show",
		type: "show",
		userId: testUser.id,
	});
}

beforeEach(() => {
	db.insert(schema.user).values(testUser).run();
	db.insert(schema.organization).values(testOrg).run();
});

describe("mediaDb", () => {
	it("creates and lists media by organization", () => {
		const movie = createMovie();
		const show = createShow();
		const results = mediaDb.list(testOrg.id);
		expect(results.map((item) => item.id).sort()).toEqual([movie.id, show.id].sort());
	});

	it("stores episodes on the media table", () => {
		const show = createShow();
		const season = seasonsDb.create({ mediaId: show.id, name: "Season 1", seasonNumber: 1 });
		const episode = mediaDb.create({
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

		expect(mediaDb.getEpisodesBySeasonId(season.id).map((item) => item.id)).toEqual([episode.id]);
		expect(mediaDb.getEpisodesByParentId(show.id).map((item) => item.id)).toEqual([episode.id]);
		expect(mediaDb.getEpisodeBySeasonAndNumber(season.id, 1)?.id).toBe(episode.id);
	});

	it("updates episode file info and playback position", () => {
		const show = createShow();
		const season = seasonsDb.create({ mediaId: show.id, name: "Season 1", seasonNumber: 1 });
		const episode = mediaDb.create({
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

		mediaDb.updateFileInfo(episode.id, { fileIndex: 0, filePath: "/library/pilot.mkv", fileSize: 1234 });
		mediaDb.updateEpisodeProgress(episode.id, 1234, "complete");
		mediaDb.updatePlayPosition(episode.id, 42, 60);

		const updated = mediaDb.getById(episode.id);
		expect(updated?.fileIndex).toBe(0);
		expect(updated?.filePath).toBe("/library/pilot.mkv");
		expect(updated?.downloadedBytes).toBe(1234);
		expect(updated?.status).toBe("complete");
		expect(updated?.playPosition).toBe(42);
		expect(updated?.playDuration).toBe(60);
	});

	it("filters library titles by media, rating, year, and genre", () => {
		const actionMovie = mediaDb.create({
			genres: JSON.stringify(["Action"]),
			organizationId: testOrg.id,
			title: "Action Movie",
			type: "movie",
			userId: testUser.id,
			voteAverage: 8,
			year: 2020,
		});
		mediaDb.create({
			genres: JSON.stringify(["Drama"]),
			organizationId: testOrg.id,
			title: "Drama Movie",
			type: "movie",
			userId: testUser.id,
			voteAverage: 9,
			year: 2010,
		});
		mediaDb.create({
			genres: JSON.stringify(["Action"]),
			organizationId: testOrg.id,
			title: "Action Show",
			type: "show",
			userId: testUser.id,
			voteAverage: 9,
			year: 2021,
		});

		const results = mediaDb.search(testOrg.id, "", {
			...DEFAULT_CATALOG_FILTERS,
			genres: ["action"],
			media: "movie",
			rating: 7.5,
			scope: "library",
			yearFrom: 2015,
		});

		expect(results.map((item) => item.id)).toEqual([actionMovie.id]);
	});

	it("filters the library by rating with the default sort", () => {
		mediaDb.create({
			organizationId: testOrg.id,
			title: "Below Threshold",
			type: "movie",
			userId: testUser.id,
			voteAverage: 6.9,
		});
		const included = mediaDb.create({
			organizationId: testOrg.id,
			title: "At Threshold",
			type: "movie",
			userId: testUser.id,
			voteAverage: 7,
		});
		const unrated = mediaDb.create({
			organizationId: testOrg.id,
			title: "Legacy Unrated",
			type: "movie",
			userId: testUser.id,
		});

		const results = mediaDb.search(testOrg.id, "", {
			...DEFAULT_CATALOG_FILTERS,
			rating: 7,
			scope: "library",
		});

		expect(results.map((item) => item.id).toSorted()).toEqual([included.id, unrated.id].toSorted());
	});

	it("treats title wildcard characters as text", () => {
		const literalMatch = mediaDb.create({
			organizationId: testOrg.id,
			title: "100% Fun",
			type: "movie",
			userId: testUser.id,
		});
		mediaDb.create({
			organizationId: testOrg.id,
			title: "1000 Fun",
			type: "movie",
			userId: testUser.id,
		});

		const results = mediaDb.search(testOrg.id, "%", {
			...DEFAULT_CATALOG_FILTERS,
			scope: "library",
		});

		expect(results.map((item) => item.id)).toEqual([literalMatch.id]);
	});

	it("sorts unknown years after known years", () => {
		const unknown = mediaDb.create({
			organizationId: testOrg.id,
			title: "Unknown",
			type: "movie",
			userId: testUser.id,
		});
		const recent = mediaDb.create({
			organizationId: testOrg.id,
			title: "Recent",
			type: "movie",
			userId: testUser.id,
			year: 2020,
		});
		const old = mediaDb.create({
			organizationId: testOrg.id,
			title: "Old",
			type: "movie",
			userId: testUser.id,
			year: 1980,
		});

		const results = mediaDb.search(testOrg.id, "", {
			...DEFAULT_CATALOG_FILTERS,
			scope: "library",
			sort: "oldest",
		});

		expect(results.map((item) => item.id)).toEqual([old.id, recent.id, unknown.id]);
	});

	it("lists failed shows in the queue, not only movies and episodes", () => {
		const show = createShow();
		mediaDb.updateProgress(show.id, 0, "error");

		const rows = mediaDb.listQueueRows(testOrg.id);

		expect(rows.map((row) => row.media.id)).toContain(show.id);
		expect(rows.length).toBe(mediaDb.countDownloadErrors(testOrg.id));
	});

	it("lists one queue row per show download", () => {
		const show = createShow();
		const first = downloadsDb.create({
			infohash: "season1",
			magnetLink: "magnet:?xt=urn:btih:season1",
			mediaId: show.id,
			status: "error",
		});
		const second = downloadsDb.create({
			infohash: "season2",
			magnetLink: "magnet:?xt=urn:btih:season2",
			mediaId: show.id,
			status: "added",
		});

		const rows = mediaDb.listQueueRows(testOrg.id);
		const showDownloads = rows.filter((row) => row.media.id === show.id).map((row) => row.download?.id);

		expect(showDownloads.toSorted()).toEqual([first.id, second.id].toSorted());
	});
});

describe("downloadsDb", () => {
	it("creates and retrieves downloads", () => {
		const movie = createMovie();
		const download = downloadsDb.create({
			infohash: "movie123",
			magnetLink: "magnet:?xt=urn:btih:movie123",
			mediaId: movie.id,
			status: "added",
		});

		expect(downloadsDb.getByMediaId(movie.id)[0]?.id).toBe(download.id);
		expect(downloadsDb.getByInfohash(movie.id, "movie123")?.id).toBe(download.id);
	});
});

describe("subtitlesDb", () => {
	it("stores subtitles by media id only", () => {
		const movie = createMovie();
		const subtitleA = subtitlesDb.create({
			filePath: "/subs/en.vtt",
			label: "English",
			language: "en",
			mediaId: movie.id,
			source: "manual",
		});
		const subtitleB = subtitlesDb.create({
			filePath: "/subs/es.vtt",
			label: "Spanish",
			language: "es",
			mediaId: movie.id,
			source: "manual",
		});

		const subtitles = subtitlesDb.getByMediaId(movie.id);
		expect(subtitles).toHaveLength(2);
		expect(subtitles.map((subtitle) => subtitle.id)).toEqual(expect.arrayContaining([subtitleA.id, subtitleB.id]));
		expect(subtitlesDb.getById(subtitleA.id)?.language).toBe("en");
		expect(subtitlesDb.getById(subtitleB.id)?.language).toBe("es");
	});
});
