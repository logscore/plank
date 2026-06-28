import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "$lib/config";
import { mediaDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import {
	buildEpisodeFileName,
	buildMovieFileName,
	buildMovieLibraryDirectoryName,
	buildShowLibraryDirectoryName,
	getEpisodeLibraryPath,
	getMovieLibraryDirectoryId,
	getMovieLibraryRoot,
	getSeasonLibraryDirectory,
	getShowLibraryDirectoryId,
	getShowLibraryRoot,
} from "$lib/server/paths";
import { db } from "./setup";

describe("media naming", () => {
	it("builds deterministic movie filenames", () => {
		expect(buildMovieFileName({ title: "Alien", year: 1979 }, "Alien.1979.mkv")).toBe("Alien (1979).mkv");
		expect(buildMovieFileName({ title: "Unknown Movie", year: null }, "movie.mp4")).toBe("Unknown Movie.mp4");
	});

	it("builds deterministic episode filenames", () => {
		expect(
			buildEpisodeFileName(
				"Breaking Bad",
				{ seasonNumber: 1, episodeNumber: 1, title: "Pilot" },
				"breaking.bad.s01e01.mkv"
			)
		).toBe("Breaking Bad - S01E01 - Pilot.mkv");
	});

	it("handles missing values when building deterministic episode filenames", () => {
		expect(
			buildEpisodeFileName("", { seasonNumber: null, episodeNumber: null, title: "" }, "breaking.bad.s01e01.exe")
		).toBe("Unknown Show - S00E00 - Episode 00.exe");
	});

	it("builds deterministic movie directory names", () => {
		expect(buildMovieLibraryDirectoryName({ title: "Alien", year: 1979 })).toBe("Alien (1979)");
		expect(buildMovieLibraryDirectoryName({ title: "Alien", year: null })).toBe("Alien");
	});

	it("builds deterministic show directory names", () => {
		expect(buildShowLibraryDirectoryName({ title: "Madmen", year: 2007 })).toBe("Madmen (2007)");
		expect(buildShowLibraryDirectoryName({ title: "Alien", year: null })).toBe("Alien");
	});

	it("sanitizes media file names", () => {
		expect(buildMovieFileName({ title: `   /Alien/\\<>:"*|?.. `, year: 1979 }, "Alien.1979.mkv")).toBe(
			"Alien (1979).mkv"
		);
		expect(buildMovieFileName({ title: `   /Alien/\\<>:"*|?.. `, year: null }, "Alien.1979.mkv")).toBe("Alien.mkv");
	});

	it("uses safe file extensions", () => {
		expect(buildMovieFileName({ title: "Alien", year: 1979 }, "Alien")).toBe("Alien (1979).mp4");
		expect(buildMovieFileName({ title: "Alien", year: null }, "Alien.1979.bin")).toBe("Alien.bin");
	});
});

// --- Library path resolution tests ---
const testUser = {
	id: "paths-user",
	name: "Paths User",
	email: "paths@example.com",
	emailVerified: true,
};

const testOrg = {
	id: "paths-org",
	name: "Paths Org",
	slug: "paths-org",
};

interface EpisodeSeed {
	seasonNumber: number;
	episodeNumber: number;
	displayOrder: number;
	filePath: string | null;
}

function createShowWithEpisodes(options: { title?: string; year?: number | null; episodes?: EpisodeSeed[] }) {
	const show = mediaDb.create({
		userId: testUser.id,
		organizationId: testOrg.id,
		type: "show",
		title: options.title ?? "Breaking Bad",
		year: options.year ?? 2008,
	});
	for (const episode of options.episodes ?? []) {
		mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "episode",
			parentId: show.id,
			seasonNumber: episode.seasonNumber,
			episodeNumber: episode.episodeNumber,
			displayOrder: episode.displayOrder,
			title: `Episode ${episode.episodeNumber}`,
			filePath: episode.filePath,
		});
	}
	return show;
}

describe("movie library paths", () => {
	it("derives the root from an existing file path, ignoring the title", () => {
		const root = getMovieLibraryRoot({
			id: "m1",
			title: "Alien",
			year: 1979,
			filePath: "/mnt/movies/Custom Folder Name/Alien.mkv",
		});
		expect(root).toBe("/mnt/movies/Custom Folder Name");
	});

	it("computes the root under the configured library when there is no file path", () => {
		const root = getMovieLibraryRoot({ id: "m1", title: "Alien", year: 1979, filePath: null });
		expect(root).toBe(path.join(config.paths.library, "Alien (1979)"));
		expect(path.basename(root)).toBe("Alien (1979)");
	});

	it("omits the year from the directory name when the movie has none", () => {
		const root = getMovieLibraryRoot({ id: "m1", title: "Akira", year: null, filePath: null });
		expect(path.basename(root)).toBe("Akira");
	});

	it("sanitizes illegal filesystem characters in the directory name", () => {
		const root = getMovieLibraryRoot({ id: "m1", title: "Spider-Man: Homecoming", year: 2017, filePath: null });
		expect(path.basename(root)).toBe("Spider-Man Homecoming (2017)");
	});

	it("derives the directory id from the on-disk parent folder, not the title", () => {
		const id = getMovieLibraryDirectoryId({
			id: "m1",
			title: "Alien",
			year: 1979,
			filePath: "/data/Films/Aliens Directors Cut (1979)/movie.mkv",
		});
		expect(id).toBe("Aliens Directors Cut (1979)");
	});

	it("falls back to the media id when the title sanitizes to nothing", () => {
		const id = getMovieLibraryDirectoryId({ id: "fallback-id", title: "???", year: null, filePath: null });
		expect(id).toBe("fallback-id");
	});
});

describe("show library paths", () => {
	beforeEach(() => {
		db.insert(schema.user).values(testUser).run();
		db.insert(schema.organization).values(testOrg).run();
	});

	it("computes the root under the configured library when the show has no downloaded episodes", () => {
		const show = createShowWithEpisodes({ title: "Breaking Bad", year: 2008 });
		expect(getShowLibraryRoot(show)).toBe(path.join(config.paths.library, "Breaking Bad (2008)"));
	});

	it("falls back to the computed root when episodes exist but none are on disk", () => {
		const show = createShowWithEpisodes({
			episodes: [{ seasonNumber: 1, episodeNumber: 1, displayOrder: 0, filePath: null }],
		});
		expect(getShowLibraryRoot(show)).toBe(path.join(config.paths.library, "Breaking Bad (2008)"));
	});

	it("prefers the actual on-disk root inferred from an existing episode", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{
					seasonNumber: 1,
					episodeNumber: 1,
					displayOrder: 0,
					filePath: "/srv/tv/Breaking Bad (2008)/Season 01/ep.mkv",
				},
			],
		});
		expect(getShowLibraryRoot(show)).toBe("/srv/tv/Breaking Bad (2008)");
	});

	it("skips episodes without a file path and uses the first one that has it", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{ seasonNumber: 1, episodeNumber: 1, displayOrder: 0, filePath: null },
				{
					seasonNumber: 2,
					episodeNumber: 1,
					displayOrder: 0,
					filePath: "/mnt/store/Breaking Bad (2008)/Season 02/e.mkv",
				},
			],
		});
		expect(getShowLibraryRoot(show)).toBe("/mnt/store/Breaking Bad (2008)");
	});

	it("uses the lowest season/episode in order when several episodes are on disk", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{ seasonNumber: 2, episodeNumber: 1, displayOrder: 0, filePath: "/disk-b/Show/Season 02/e.mkv" },
				{ seasonNumber: 1, episodeNumber: 1, displayOrder: 0, filePath: "/disk-a/Show/Season 01/e.mkv" },
			],
		});
		expect(getShowLibraryRoot(show)).toBe("/disk-a/Show");
	});

	it("derives the show directory id from the on-disk folder", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{ seasonNumber: 1, episodeNumber: 1, displayOrder: 0, filePath: "/x/Custom Show Dir/Season 01/e.mkv" },
			],
		});
		expect(getShowLibraryDirectoryId(show)).toBe("Custom Show Dir");
	});

	it("returns the computed show directory id when nothing is on disk", () => {
		const show = createShowWithEpisodes({ title: "The Wire", year: 2002 });
		expect(getShowLibraryDirectoryId(show)).toBe("The Wire (2002)");
	});
});

describe("season and episode paths", () => {
	beforeEach(() => {
		db.insert(schema.user).values(testUser).run();
		db.insert(schema.organization).values(testOrg).run();
	});

	it("pads season numbers to two digits and nests them under the show root", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{ seasonNumber: 1, episodeNumber: 1, displayOrder: 0, filePath: "/srv/tv/Show (2020)/Season 01/e.mkv" },
			],
		});
		expect(getSeasonLibraryDirectory(show, 2)).toBe("/srv/tv/Show (2020)/Season 02");
		expect(getSeasonLibraryDirectory(show, 12)).toBe("/srv/tv/Show (2020)/Season 12");
	});

	it("treats a null season as Season 00 and does not truncate 3-digit seasons", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{ seasonNumber: 1, episodeNumber: 1, displayOrder: 0, filePath: "/srv/tv/Show (2020)/Season 01/e.mkv" },
			],
		});
		expect(getSeasonLibraryDirectory(show, null)).toBe("/srv/tv/Show (2020)/Season 00");
		expect(getSeasonLibraryDirectory(show, 123)).toBe("/srv/tv/Show (2020)/Season 123");
	});

	it("composes the season directory under the computed library when nothing is on disk", () => {
		const show = createShowWithEpisodes({ title: "Fringe", year: 2008 });
		expect(getSeasonLibraryDirectory(show, 3)).toBe(path.join(config.paths.library, "Fringe (2008)", "Season 03"));
	});

	it("builds the full episode path: show root + season dir + episode file name", () => {
		const show = createShowWithEpisodes({
			title: "Mr Robot",
			year: 2015,
			episodes: [
				{
					seasonNumber: 2,
					episodeNumber: 5,
					displayOrder: 0,
					filePath: "/srv/tv/Mr Robot (2015)/Season 02/x.mkv",
				},
			],
		});
		const episodePath = getEpisodeLibraryPath(
			show,
			{ title: "eps2.3", seasonNumber: 2, episodeNumber: 5 },
			"mr.robot.s02e05.1080p.mkv"
		);
		expect(episodePath).toBe("/srv/tv/Mr Robot (2015)/Season 02/Mr Robot - S02E05 - eps2.3.mkv");
	});

	it("falls back to a .mp4 extension when the source file has none", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{
					seasonNumber: 1,
					episodeNumber: 10,
					displayOrder: 0,
					filePath: "/srv/tv/Breaking Bad (2008)/Season 01/x.mkv",
				},
			],
		});
		const episodePath = getEpisodeLibraryPath(
			show,
			{ title: "Finale", seasonNumber: 1, episodeNumber: 10 },
			"source-without-extension"
		);
		expect(episodePath).toBe("/srv/tv/Breaking Bad (2008)/Season 01/Breaking Bad - S01E10 - Finale.mp4");
	});

	it("sanitizes illegal characters in the episode title within the path", () => {
		const show = createShowWithEpisodes({
			episodes: [
				{
					seasonNumber: 1,
					episodeNumber: 2,
					displayOrder: 0,
					filePath: "/srv/tv/Breaking Bad (2008)/Season 01/x.mkv",
				},
			],
		});
		const episodePath = getEpisodeLibraryPath(
			show,
			{ title: "Part 1/2: The End?", seasonNumber: 1, episodeNumber: 2 },
			"x.mkv"
		);
		expect(path.basename(episodePath)).toBe("Breaking Bad - S01E02 - Part 1 2 The End.mkv");
	});
});
