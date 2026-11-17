import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMediaAccess, getById, searchSubtitles } = vi.hoisted(() => ({
	requireMediaAccess: vi.fn(),
	getById: vi.fn(),
	searchSubtitles: vi.fn(),
}));

vi.mock("$lib/server/api-guard", () => ({ requireMediaAccess }));
vi.mock("$lib/server/db", () => ({ mediaDb: { getById } }));
vi.mock("$lib/server/opensubtitles", () => ({ searchSubtitles }));

import { GET } from "../routes/api/media/[id]/subtitles/search/+server";

function search(query = "") {
	return GET({
		params: { id: "media-1" },
		locals: {},
		url: new URL(`http://localhost/api/media/media-1/subtitles/search${query}`),
	} as never);
}

describe("subtitle search route", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		searchSubtitles.mockResolvedValue([]);
	});

	it("searches movies by their identity without an additional title filter", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: { type: "movie", title: "Translated title", tmdbId: 123, year: 2020 },
		});

		const response = await search("?languages=en,es");

		expect(response.status).toBe(200);
		expect(searchSubtitles).toHaveBeenCalledWith(
			expect.objectContaining({ tmdbId: 123, query: undefined, year: 2020, languages: "en,es" })
		);
		expect(getById).not.toHaveBeenCalled();
	});

	it("uses the parent show and stored episode numbers from the watch page", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: {
				type: "episode",
				parentId: "show-1",
				title: "Pilot",
				tmdbId: 999,
				seasonNumber: 0,
				episodeNumber: 2,
				year: 2024,
			},
		});
		getById.mockReturnValue({ title: "Example show", tmdbId: 123, imdbId: "tt456", year: 2018 });

		await search("?languages=en&seasonNumber=1&episodeNumber=1");

		expect(getById).toHaveBeenCalledWith("show-1");
		expect(searchSubtitles).toHaveBeenCalledWith(
			expect.objectContaining({
				parentTmdbId: 123,
				parentImdbId: "tt456",
				tmdbId: undefined,
				query: undefined,
				year: undefined,
				seasonNumber: 0,
				episodeNumber: 2,
			})
		);
	});

	it("falls back to the show title when external identifiers are missing", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: { type: "episode", parentId: "show-1", title: "Pilot", seasonNumber: 1, episodeNumber: 1 },
		});
		getById.mockReturnValue({ title: "Example show" });

		await search();

		expect(searchSubtitles).toHaveBeenCalledWith(
			expect.objectContaining({ query: "Example show", seasonNumber: 1, episodeNumber: 1 })
		);
	});

	it("preserves useful provider errors for the search popover", async () => {
		requireMediaAccess.mockReturnValue({ mediaItem: { type: "movie", title: "Example" } });
		searchSubtitles.mockRejectedValue(new Error("OpenSubtitles API key not configured"));

		await expect(search()).rejects.toMatchObject({
			status: 500,
			body: { message: "OpenSubtitles API key not configured" },
		});
	});

	it("checks access before searching", async () => {
		requireMediaAccess.mockImplementation(() => {
			throw new Error("Unauthorized");
		});

		await expect(search()).rejects.toThrow("Unauthorized");
		expect(searchSubtitles).not.toHaveBeenCalled();
	});
});
