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
			directory: "/movies/Custom Alien Folder",
			episodeNumber: null,
			filePath: "/movies/Custom Alien Folder/Alien.mkv",
			language: "en",
			namePrefix: "English",
			type: "movie" as const,
		},
		{
			directory: path.join(PATHS.library, "Alien (1979)"),
			episodeNumber: null,
			filePath: null,
			language: "en",
			namePrefix: "English",
			type: "movie" as const,
		},
		...[
			{ episodeNumber: 1, namePrefix: "E01_Spanish" },
			{ episodeNumber: 0, namePrefix: "E00_Spanish" },
			{ episodeNumber: 12, namePrefix: "E12_Spanish" },
			{ episodeNumber: 100, namePrefix: "E100_Spanish" },
			{ episodeNumber: null, namePrefix: "E00_Spanish" },
		].map((episode) => ({
			directory: "/shows/Example (2020)/Season 01",
			filePath: "/shows/Example (2020)/Season 01/Example - S01E01.mkv",
			language: "es",
			type: "episode" as const,
			...episode,
		})),
		{
			directory: path.join(PATHS.library, "Example (2020)", "Season 01"),
			episodeNumber: 12,
			filePath: null,
			language: "es",
			namePrefix: "E12_Spanish",
			type: "episode" as const,
		},
	])(
		"saves $namePrefix $type subtitles under $directory/subtitles",
		async ({ type, filePath, directory, language, episodeNumber, namePrefix }) => {
			let parentId: string | null = null;
			if (type === "episode" && !filePath) {
				db.insert(schema.user)
					.values({ email: "subtitles@example.com", id: "subtitle-user", name: "User" })
					.run();
				parentId = mediaDb.create({ title: "Example", type: "show", userId: "subtitle-user", year: 2020 }).id;
			}
			const mkdir = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
			const writeFile = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
			vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
			vi.spyOn(Date, "now").mockReturnValue(123_456_789);
			vi.stubGlobal(
				"fetch",
				vi
					.fn()
					.mockResolvedValueOnce(
						Response.json({ file_name: "Alien.srt", link: "https://example.com/subtitle" })
					)
					.mockResolvedValueOnce(new Response("subtitle content"))
					.mockResolvedValueOnce(
						Response.json({ file_name: "Alien.srt", link: "https://example.com/subtitle" })
					)
					.mockResolvedValueOnce(new Response("subtitle content"))
			);

			const media = {
				episodeNumber,
				filePath,
				id: "media-id",
				parentId,
				seasonNumber: 1,
				title: "Alien",
				type,
				year: 1979,
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
		}
	);

	it("rejects episodes without a video path or parent show before downloading", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(
			downloadSubtitle(
				123,
				{
					episodeNumber: 1,
					filePath: null,
					id: "episode-id",
					parentId: null,
					seasonNumber: 1,
					title: "Pilot",
					type: "episode",
					year: null,
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
					attributes: {
						files: [{ file_id: episode, file_name: "subtitle.srt" }],
						language: "en",
					},
					id: String(episode),
				})),
			})
		);
		vi.stubGlobal("fetch", fetchMock);

		await searchSubtitles({
			episodeNumber: 2,
			languages: "en",
			parentImdbId: "tt456",
			parentTmdbId: 123,
			seasonNumber: 0,
		});

		const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
		expect(url.searchParams.get("parent_tmdb_id")).toBe("123");
		expect(url.searchParams.get("parent_imdb_id")).toBe("456");
		expect(url.searchParams.get("season_number")).toBe("0");
		expect(url.searchParams.get("episode_number")).toBe("2");
		expect(url.searchParams.has("tmdb_id")).toBe(false);
	});
});
