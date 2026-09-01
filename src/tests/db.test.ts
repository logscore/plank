import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CATALOG_FILTERS } from "$lib/data/search";
import { downloadsDb, mediaDb, seasonsDb, subtitlesDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { db } from "./setup";

const testUser = {
	id: "user-1",
	name: "Test User",
	email: "test@example.com",
	emailVerified: true,
};

const testOrg = {
	id: "org-1",
	name: "Test Org",
	slug: "test-org",
	createdAt: new Date(),
};

function createMovie() {
	return mediaDb.create({
		userId: testUser.id,
		organizationId: testOrg.id,
		type: "movie",
		title: "Test Movie",
		magnetLink: "magnet:?xt=urn:btih:movie123",
		infohash: "movie123",
	});
}

function createShow() {
	return mediaDb.create({
		userId: testUser.id,
		organizationId: testOrg.id,
		type: "show",
		title: "Test Show",
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
		const season = seasonsDb.create({ mediaId: show.id, seasonNumber: 1, name: "Season 1" });
		const episode = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "episode",
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			episodeNumber: 1,
			displayOrder: 0,
			title: "Pilot",
			status: "pending",
		});

		expect(mediaDb.getEpisodesBySeasonId(season.id).map((item) => item.id)).toEqual([episode.id]);
		expect(mediaDb.getEpisodesByParentId(show.id).map((item) => item.id)).toEqual([episode.id]);
		expect(mediaDb.getEpisodeBySeasonAndNumber(season.id, 1)?.id).toBe(episode.id);
	});

	it("updates episode file info and playback position", () => {
		const show = createShow();
		const season = seasonsDb.create({ mediaId: show.id, seasonNumber: 1, name: "Season 1" });
		const episode = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "episode",
			parentId: show.id,
			seasonId: season.id,
			seasonNumber: 1,
			episodeNumber: 1,
			displayOrder: 0,
			title: "Pilot",
			status: "pending",
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
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Action Movie",
			year: 2020,
			voteAverage: 8,
			genres: JSON.stringify(["Action"]),
		});
		mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Drama Movie",
			year: 2010,
			voteAverage: 9,
			genres: JSON.stringify(["Drama"]),
		});
		mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "show",
			title: "Action Show",
			year: 2021,
			voteAverage: 9,
			genres: JSON.stringify(["Action"]),
		});

		const results = mediaDb.search(testOrg.id, "", {
			...DEFAULT_CATALOG_FILTERS,
			scope: "library",
			media: "movie",
			rating: 7.5,
			yearFrom: 2015,
			genres: ["action"],
		});

		expect(results.map((item) => item.id)).toEqual([actionMovie.id]);
	});

	it("filters the library by rating with the default sort", () => {
		mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Below Threshold",
			voteAverage: 6.9,
		});
		const included = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "At Threshold",
			voteAverage: 7,
		});
		const unrated = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Legacy Unrated",
		});

		const results = mediaDb.search(testOrg.id, "", {
			...DEFAULT_CATALOG_FILTERS,
			scope: "library",
			rating: 7,
		});

		expect(results.map((item) => item.id).toSorted()).toEqual([included.id, unrated.id].toSorted());
	});

	it("treats title wildcard characters as text", () => {
		const literalMatch = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "100% Fun",
		});
		mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "1000 Fun",
		});

		const results = mediaDb.search(testOrg.id, "%", {
			...DEFAULT_CATALOG_FILTERS,
			scope: "library",
		});

		expect(results.map((item) => item.id)).toEqual([literalMatch.id]);
	});

	it("sorts unknown years after known years", () => {
		const unknown = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Unknown",
		});
		const recent = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Recent",
			year: 2020,
		});
		const old = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Old",
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
			mediaId: show.id,
			magnetLink: "magnet:?xt=urn:btih:season1",
			infohash: "season1",
			status: "error",
		});
		const second = downloadsDb.create({
			mediaId: show.id,
			magnetLink: "magnet:?xt=urn:btih:season2",
			infohash: "season2",
			status: "added",
		});

		const rows = mediaDb.listQueueRows(testOrg.id);
		const showDownloads = rows.filter((row) => row.media.id === show.id).map((row) => row.download?.id);

		expect(showDownloads).toEqual([first.id, second.id]);
	});
});

describe("downloadsDb", () => {
	it("creates and retrieves downloads", () => {
		const movie = createMovie();
		const download = downloadsDb.create({
			mediaId: movie.id,
			magnetLink: "magnet:?xt=urn:btih:movie123",
			infohash: "movie123",
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
			mediaId: movie.id,
			language: "en",
			label: "English",
			source: "manual",
			format: "vtt",
			filePath: "/subs/en.vtt",
			streamIndex: null,
			isDefault: false,
			isForced: false,
		});
		const subtitleB = subtitlesDb.create({
			mediaId: movie.id,
			language: "es",
			label: "Spanish",
			source: "manual",
			format: "vtt",
			filePath: "/subs/es.vtt",
			streamIndex: null,
			isDefault: false,
			isForced: false,
		});

		subtitlesDb.setDefault(subtitleB.id, movie.id, true);

		const subtitles = subtitlesDb.getByMediaId(movie.id);
		expect(subtitles).toHaveLength(2);
		expect(subtitles.find((subtitle) => subtitle.id === subtitleA.id)?.isDefault).toBe(false);
		expect(subtitles.find((subtitle) => subtitle.id === subtitleB.id)?.isDefault).toBe(true);
	});
});
