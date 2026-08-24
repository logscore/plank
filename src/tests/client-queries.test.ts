import { createQuery } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock svelte-query to capture calls
vi.mock("@tanstack/svelte-query", () => ({
	createQuery: vi.fn(),
	useQueryClient: vi.fn(),
	createMutation: vi.fn(),
}));

import { createSeasonsQuery, fetchSeasons } from "$lib/queries/browse-queries";
import { searchOpenSubtitles } from "$lib/queries/media-queries";

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("Client Queries", () => {
	beforeEach(() => {
		fetchMock.mockReset();
		vi.mocked(createQuery).mockClear();
	});

	describe("Media Queries", () => {
		it("searchOpenSubtitles should omit null episode number", async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => [],
			});

			await searchOpenSubtitles("123", {
				languages: "en",
				seasonNumber: 1,
				episodeNumber: null,
			});

			const url = new URL(vi.mocked(fetchMock).mock.calls[0][0] as string, "http://localhost");
			expect(url.pathname).toBe("/api/media/123/subtitles/search");
			expect(url.searchParams.get("seasonNumber")).toBe("1");
			expect(url.searchParams.get("episodeNumber")).toBeNull();
		});
	});

	describe("Browse Queries", () => {
		it("fetchTrending should call trending endpoint", async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ items: [], page: 1, totalPages: 1 }),
			});

			await import("$lib/queries/browse-queries").then((m) => m.fetchTrending("movie", 2));
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/api/browse?type=trending&filter=movie&page=2")
			);
		});

		it("fetchBrowse should call browse endpoint", async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ items: [], page: 1, totalPages: 1 }),
			});

			await import("$lib/queries/browse-queries").then((m) => m.fetchBrowse("popular", "show", 1));
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/api/browse?type=popular&filter=show&page=1")
			);
		});

		it("resolveTorrent should call resolve endpoint", async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ success: true }),
			});

			const item = {
				imdbId: "tt123",
				tmdbId: 456,
				title: "Test Movie",
			};

			await import("$lib/queries/browse-queries").then((m) => m.resolveTorrent(item));
			expect(fetchMock).toHaveBeenCalledWith("/api/browse/resolve", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(item),
			});
		});

		it("fetchProwlarrStatus should call status endpoint", async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({
					configured: true,
					url: "",
					connectionStatus: "connected",
					indexerCount: 1,
					indexers: [],
					needsSetup: false,
				}),
			});

			await import("$lib/queries/browse-queries").then((m) => m.fetchProwlarrStatus());
			expect(fetchMock).toHaveBeenCalledWith("/api/prowlarr/status");
		});

		it("fetchSeasons should call seasons endpoint", async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ seasons: [] }),
			});

			await fetchSeasons(12_345);
			expect(fetchMock).toHaveBeenCalledWith("/api/browse/seasons/12345");
		});
	});

	describe("TanStack Query Creators", () => {
		it("createSeasonsQuery should configure query correctly", () => {
			createSeasonsQuery(123);
			expect(createQuery).toHaveBeenCalled();
			const optionsFn = vi.mocked(createQuery).mock.calls[0][0] as () => any;
			const options = optionsFn();
			expect(options).toEqual(
				expect.objectContaining({
					queryKey: ["browse", "seasons", 123],
					staleTime: 3_600_000,
				})
			);
		});
	});

	describe("Error Handling", () => {
		it("fetchTrending should throw error when response is not ok", async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Error",
			});

			const { fetchTrending } = await import("$lib/queries/browse-queries");
			await expect(fetchTrending("all", 1)).rejects.toThrow("Failed to fetch trending");
		});

		it("fetchBrowse should throw error when response is not ok", async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Error",
			});

			const { fetchBrowse } = await import("$lib/queries/browse-queries");
			await expect(fetchBrowse("popular", "movie", 1)).rejects.toThrow("Failed to fetch popular");
		});

		it("resolveTorrent should throw error when response is not ok", async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Error",
			});

			const { resolveTorrent } = await import("$lib/queries/browse-queries");
			await expect(resolveTorrent({ imdbId: "tt", tmdbId: 1, title: "T" })).rejects.toThrow(
				"Failed to resolve torrent"
			);
		});

		it("fetchProwlarrStatus should throw error when response is not ok", async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Error",
			});

			const { fetchProwlarrStatus } = await import("$lib/queries/browse-queries");
			await expect(fetchProwlarrStatus()).rejects.toThrow("Failed to fetch Prowlarr status");
		});

		it("fetchSeasons should throw error when response is not ok", async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Error",
			});

			const { fetchSeasons } = await import("$lib/queries/browse-queries");
			await expect(fetchSeasons(123)).rejects.toThrow("Failed to fetch seasons");
		});
	});
});
