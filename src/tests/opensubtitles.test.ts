import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { db } from "./setup";

vi.mock("$lib/server/settings", () => ({
	getSettings: vi.fn(async () => ({ opensubtitles: { apiKey: "test-key" } })),
}));

vi.mock("$lib/server/ffmpeg", () => ({
	convertSubtitleToVtt: vi.fn(async () => undefined),
}));

import { downloadSubtitle, searchSubtitles } from "$lib/server/opensubtitles";
import { PATHS } from "$lib/server/paths";

describe("OpenSubtitles downloads", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it.each([
		{
			type: "movie" as const,
			filePath: "/movies/Custom Alien Folder/Alien.mkv",
			directory: "/movies/Custom Alien Folder",
			language: "en",
			episodeNumber: null,
			namePrefix: "English",
		},
		{
			type: "movie" as const,
			filePath: null,
			directory: path.join(PATHS.library, "Alien (1979)"),
			language: "en",
			episodeNumber: null,
			namePrefix: "English",
		},
		...[
			{ episodeNumber: 1, namePrefix: "E01_Spanish" },
			{ episodeNumber: 0, namePrefix: "E00_Spanish" },
			{ episodeNumber: 12, namePrefix: "E12_Spanish" },
			{ episodeNumber: 100, namePrefix: "E100_Spanish" },
			{ episodeNumber: null, namePrefix: "E00_Spanish" },
		].map((episode) => ({
			type: "episode" as const,
			filePath: "/shows/Example (2020)/Season 01/Example - S01E01.mkv",
			directory: "/shows/Example (2020)/Season 01",
			language: "es",
			...episode,
		})),
		{
			type: "episode" as const,
			filePath: null,
			directory: path.join(PATHS.library, "Example (2020)", "Season 01"),
			language: "es",
			episodeNumber: 12,
			namePrefix: "E12_Spanish",
		},
	])("saves $namePrefix $type subtitles under $directory/subtitles", async ({
		type,
		filePath,
		directory,
		language,
		episodeNumber,
		namePrefix,
	}) => {
		let parentId: string | null = null;
		if (type === "episode" && !filePath) {
			db.insert(schema.user).values({ id: "subtitle-user", name: "User", email: "subtitles@example.com" }).run();
			parentId = mediaDb.create({ userId: "subtitle-user", type: "show", title: "Example", year: 2020 }).id;
		}
		const mkdir = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
		const writeFile = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
		vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
		vi.spyOn(Date, "now").mockReturnValue(123_456_789);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce(Response.json({ link: "https://example.com/subtitle", file_name: "Alien.srt" }))
				.mockResolvedValueOnce(new Response("subtitle content"))
				.mockResolvedValueOnce(Response.json({ link: "https://example.com/subtitle", file_name: "Alien.srt" }))
				.mockResolvedValueOnce(new Response("subtitle content"))
		);

		const media = {
			id: "media-id",
			type,
			title: "Alien",
			year: 1979,
			filePath,
			parentId,
			seasonNumber: 1,
			episodeNumber,
		};
		const result = await downloadSubtitle(123, media, language);

		const subtitleDir = path.join(directory, "subtitles");
		expect(mkdir).toHaveBeenCalledWith(subtitleDir, { recursive: true });
		expect(writeFile).toHaveBeenCalledWith(
			expect.stringContaining(`${subtitleDir}/${namePrefix}_`),
			"subtitle content",
			"utf-8"
		);
		expect(path.dirname(result.filePath)).toBe(subtitleDir);
		expect(path.extname(result.filePath)).toBe(".vtt");
		expect(path.basename(result.filePath)).toMatch(new RegExp(`^${namePrefix}_[A-Za-z0-9_-]{21}\\.vtt$`));
		expect(writeFile.mock.calls[0][0]).toBe(result.filePath.replace(/\.vtt$/, ".srt"));

		const second = await downloadSubtitle(123, media, language);
		expect(second.filePath).not.toBe(result.filePath);
	});

	it("rejects episodes without a video path or parent show before downloading", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(
			downloadSubtitle(
				123,
				{
					id: "episode-id",
					type: "episode",
					title: "Pilot",
					year: null,
					filePath: null,
					parentId: null,
					seasonNumber: 1,
					episodeNumber: 1,
				},
				"en"
			)
		).rejects.toThrow("Episode's show not found");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("OpenSubtitles episode searches", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("sends parent IDs and episode filters, including season zero", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				data: [2, 3].map((episode) => ({
					id: String(episode),
					attributes: {
						language: "en",
						files: [{ file_id: episode, file_name: "subtitle.srt" }],
					},
				})),
			})
		);
		vi.stubGlobal("fetch", fetchMock);

		await searchSubtitles({
			parentTmdbId: 123,
			parentImdbId: "tt456",
			seasonNumber: 0,
			episodeNumber: 2,
			languages: "en",
		});

		const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
		expect(url.searchParams.get("parent_tmdb_id")).toBe("123");
		expect(url.searchParams.get("parent_imdb_id")).toBe("456");
		expect(url.searchParams.get("season_number")).toBe("0");
		expect(url.searchParams.get("episode_number")).toBe("2");
		expect(url.searchParams.has("tmdb_id")).toBe(false);
	});
});
