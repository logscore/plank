import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/settings", () => ({
	getSettings: vi.fn(async () => ({ opensubtitles: { apiKey: "test-key" } })),
}));

import { searchSubtitles } from "$lib/server/opensubtitles";

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
