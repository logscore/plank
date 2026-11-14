import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMediaAccess, getById, searchSubtitles } = vi.hoisted(() => ({
	getById: vi.fn(),
	requireMediaAccess: vi.fn(),
	searchSubtitles: vi.fn(),
}));

vi.mock("$lib/server/api-guard", () => ({ requireMediaAccess }));
vi.mock("$lib/server/db", () => ({ mediaDb: { getById } }));
vi.mock("$lib/server/opensubtitles", () => ({ searchSubtitles }));

import { GET } from "../routes/api/media/[id]/subtitles/search/+server";

function search(query = "") {
	return GET({
		locals: {},
		params: { id: "media-1" },
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
			mediaItem: { title: "Translated title", tmdbId: 123, type: "movie", year: 2020 },
		});

		const response = await search("?languages=en,es");

		expect(response.status).toBe(200);
		expect(searchSubtitles).toHaveBeenCalledWith(
			expect.objectContaining({ languages: "en,es", query: undefined, tmdbId: 123, year: 2020 })
		);
		expect(getById).not.toHaveBeenCalled();
	});

	it("uses the parent show and stored episode numbers from the watch page", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: {
				episodeNumber: 2,
				parentId: "show-1",
				seasonNumber: 0,
				title: "Pilot",
				tmdbId: 999,
				type: "episode",
				year: 2024,
			},
		});
		getById.mockReturnValue({ imdbId: "tt456", title: "Example show", tmdbId: 123, year: 2018 });

		await search("?languages=en&seasonNumber=1&episodeNumber=1");

		expect(getById).toHaveBeenCalledWith("show-1");
		expect(searchSubtitles).toHaveBeenCalledWith(
			expect.objectContaining({
				episodeNumber: 2,
				parentImdbId: "tt456",
				parentTmdbId: 123,
				query: undefined,
				seasonNumber: 0,
				tmdbId: undefined,
				year: undefined,
			})
		);
	});

	it("falls back to the show title when external identifiers are missing", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: { episodeNumber: 1, parentId: "show-1", seasonNumber: 1, title: "Pilot", type: "episode" },
		});
		getById.mockReturnValue({ title: "Example show" });

		await search();

		expect(searchSubtitles).toHaveBeenCalledWith(
			expect.objectContaining({ episodeNumber: 1, query: "Example show", seasonNumber: 1 })
		);
	});

	it("preserves useful provider errors for the search popover", async () => {
		requireMediaAccess.mockReturnValue({ mediaItem: { title: "Example", type: "movie" } });
		searchSubtitles.mockRejectedValue(new Error("OpenSubtitles API key not configured"));

		await expect(search()).rejects.toMatchObject({
			body: { message: "OpenSubtitles API key not configured" },
			status: 500,
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
