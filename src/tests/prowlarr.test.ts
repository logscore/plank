import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	filterByQuality,
	filterByReleaseGroup,
	findBestTorrent,
	type IndexerResult,
	parseProwlarrResults,
	searchProwlarr,
	searchSourceCandidates,
	selectBestTorrent,
} from "$lib/server/prowlarr";
import { updateSettings } from "$lib/server/settings";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Prowlarr Client", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		global.fetch = mockFetch;
		await updateSettings({ prowlarrApiKey: "", prowlarrUrl: "" });
	});

	describe("settings integration", () => {
		it("uses Prowlarr settings from env when DB settings are empty", async () => {
			mockFetch.mockResolvedValueOnce({
				json: async () => [],
				ok: true,
			});

			await searchProwlarr("tt1234567");

			const url = mockFetch.mock.calls[0][0] as string;
			expect(url).toContain("http://localhost:9696/api/v1/search");
			expect(url).toContain("apikey=test-api-key");
		});

		it("uses Prowlarr settings from DB over env", async () => {
			await updateSettings({ prowlarrApiKey: "db-prowlarr-api-key", prowlarrUrl: "http://db-prowlarr:9696" });
			mockFetch.mockResolvedValueOnce({
				json: async () => [],
				ok: true,
			});

			await searchProwlarr("tt1234567");

			const url = mockFetch.mock.calls[0][0] as string;
			expect(url).toContain("http://db-prowlarr:9696/api/v1/search");
			expect(url).toContain("apikey=db-prowlarr-api-key");
			expect(url).not.toContain("test-api-key");
		});
	});

	describe("parseProwlarrResults", () => {
		it("should parse Prowlarr JSON response", () => {
			const mockResponse = [
				{
					indexer: "YTS",
					infoHash: "abc123",
					magnetUrl: "magnet:?xt=urn:btih:abc123",
					seeders: 150,
					size: 2_147_483_648,
					title: "Movie.2024.1080p.BluRay.x264-YTS",
				},
				{
					downloadUrl: "magnet:?xt=urn:btih:def456",
					indexer: "RARBG",
					infoHash: "def456",
					seeders: 75,
					size: 1_073_741_824,
					title: "Movie.2024.720p.WEB-DL-RARBG",
				},
			];

			const results = parseProwlarrResults(mockResponse);

			expect(results).toHaveLength(2);
			expect(results[0].title).toBe("Movie.2024.1080p.BluRay.x264-YTS");
			expect(results[0].magnetUri).toBe("magnet:?xt=urn:btih:abc123");
			expect(results[0].infohash).toBe("abc123");
			expect(results[0].size).toBe(2_147_483_648);
			expect(results[0].seeders).toBe(150);
			expect(results[0].indexer).toBe("YTS");
		});

		it("should handle empty results", () => {
			const results = parseProwlarrResults([]);
			expect(results).toHaveLength(0);
		});

		it("should filter out results without magnet links or infohash", () => {
			const mockResponse = [
				{
					infoHash: "abc123",
					magnetUrl: "magnet:?xt=urn:btih:abc123",
					seeders: 100,
					size: 2_147_483_648,
					title: "Movie.2024.1080p.BluRay",
				},
				{
					seeders: 50,
					// No magnet
					size: 1_073_741_824,
					title: "Movie.2024.720p.WEB-DL",
				},
			];

			const results = parseProwlarrResults(mockResponse as any);
			expect(results).toHaveLength(1);
			expect(results[0].title).toBe("Movie.2024.1080p.BluRay");
		});
	});

	describe("filterByReleaseGroup", () => {
		const createResult = (title: string, seeders = 100): IndexerResult => ({
			indexer: "Test",
			infohash: "hash",
			magnetUri: "magnet:?xt=urn:btih:hash",
			seeders,
			size: 2_147_483_648,
			title,
		});

		it("should filter for trusted release groups", () => {
			const results: IndexerResult[] = [
				createResult("Movie.2024.1080p.BluRay.x264-YTS"),
				createResult("Movie.2024.1080p.BluRay.x264-RARBG"),
				createResult("Movie.2024.1080p.BluRay.x264-BONE"),
				createResult("Movie.2024.1080p.WEB-DL-YIFY"),
			];

			const trustedGroups = ["YTS", "YIFY", "BONE"];
			const filtered = filterByReleaseGroup(results, trustedGroups);

			expect(filtered).toHaveLength(3);
			expect(filtered.map((r) => r.title)).toEqual([
				"Movie.2024.1080p.BluRay.x264-YTS",
				"Movie.2024.1080p.BluRay.x264-BONE",
				"Movie.2024.1080p.WEB-DL-YIFY",
			]);
		});

		it("should return all results if no trusted groups specified", () => {
			const results: IndexerResult[] = [
				createResult("Movie.2024.1080p.BluRay.x264-YTS"),
				createResult("Movie.2024.1080p.BluRay.x264-RARBG"),
			];

			const filtered = filterByReleaseGroup(results, []);
			expect(filtered).toHaveLength(2);
		});
	});

	describe("filterByQuality", () => {
		const createResult = (title: string, seeders = 100): IndexerResult => ({
			indexer: "Test",
			infohash: "hash",
			magnetUri: "magnet:?xt=urn:btih:hash",
			seeders,
			size: 2_147_483_648,
			title,
		});

		it("should filter out low quality releases (CAM, TS, etc)", () => {
			const results: IndexerResult[] = [
				createResult("Movie.2024.1080p.BluRay.x264-YTS"),
				createResult("Movie.2024.CAM.x264-LOL"),
				createResult("Movie.2024.TS.x264-LOL"),
				createResult("Movie.2024.HDCAM.x264-LOL"),
				createResult("Movie.2024.720p.WEB-DL-YIFY"),
			];

			const filtered = filterByQuality(results);

			expect(filtered).toHaveLength(2);
			expect(filtered.map((r) => r.title)).toEqual([
				"Movie.2024.1080p.BluRay.x264-YTS",
				"Movie.2024.720p.WEB-DL-YIFY",
			]);
		});

		it("should keep high quality releases", () => {
			const results: IndexerResult[] = [
				createResult("Movie.2024.2160p.UHD.BluRay.x265-YTS"),
				createResult("Movie.2024.1080p.BluRay.x264-BONE"),
				createResult("Movie.2024.720p.BluRay.x264-YIFY"),
			];

			const filtered = filterByQuality(results);
			expect(filtered).toHaveLength(3);
		});
	});

	describe("selectBestTorrent", () => {
		const createResult = (title: string, seeders: number, size: number): IndexerResult => ({
			indexer: "Test",
			infohash: title,
			magnetUri: `magnet:?xt=urn:btih:${title}`,
			seeders,
			size,
			title,
		});

		it("should select torrent with most seeders", () => {
			const results: IndexerResult[] = [
				createResult("Movie.1080p-A", 50, 2_147_483_648),
				createResult("Movie.1080p-B", 200, 2_147_483_648),
				createResult("Movie.1080p-C", 100, 2_147_483_648),
			];

			const best = selectBestTorrent(results);
			expect(best?.title).toBe("Movie.1080p-B");
		});

		it("should return null for empty results", () => {
			const best = selectBestTorrent([]);
			expect(best).toBeNull();
		});

		it("should prefer higher quality when seeders are equal", () => {
			const results: IndexerResult[] = [
				createResult("Movie.2024.720p.BluRay-A", 50, 1_073_741_824),
				createResult("Movie.2024.1080p.BluRay-B", 50, 2_147_483_648),
			];

			// With equal seeders, 1080p should win due to quality score (80 vs 60)
			const best = selectBestTorrent(results);
			expect(best?.title).toBe("Movie.2024.1080p.BluRay-B");
		});

		it("should prefer 1337x, then YTS, then The Pirate Bay when quality and seeders match", () => {
			const results: IndexerResult[] = [
				{ ...createResult("Movie.2024.1080p.BluRay-TPB", 50, 2_147_483_648), indexer: "The Pirate Bay" },
				{ ...createResult("Movie.2024.1080p.BluRay-YTS", 50, 2_147_483_648), indexer: "YTS" },
				{ ...createResult("Movie.2024.1080p.BluRay-1337x", 50, 2_147_483_648), indexer: "1337x" },
			];

			const best = selectBestTorrent(results);
			expect(best?.indexer).toBe("1337x");
		});
	});

	describe("searchProwlarr", () => {
		it("should search Prowlarr", async () => {
			const mockResponse = [
				{
					infoHash: "abc123",
					magnetUrl: "magnet:?xt=urn:btih:abc123",
					seeders: 150,
					size: 2_147_483_648,
					title: "Movie.2024.1080p.BluRay.x264-YTS",
				},
			];

			mockFetch.mockResolvedValueOnce({
				json: async () => mockResponse,
				ok: true,
			});

			const results = await searchProwlarr("tt1234567");

			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/search"), expect.any(Object));
			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("query=tt1234567"), expect.any(Object));
			expect(results).toHaveLength(1);
		});

		it("should handle API errors gracefully", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
			});

			const results = await searchProwlarr("tt1234567");
			expect(results).toEqual([]);
		});
	});

	describe("Movie Fallback Search", () => {
		it.each([
			{
				name: "matches accents and release separators",
				title: "Déjà Vu",
				year: 2006,
				releases: ["Deja.Vu.2006.1080p-YTS"],
				expected: "Deja.Vu.2006.1080p-YTS",
				query: "deja vu 2006",
			},
			{
				name: "selects It over the higher-quality It Comes at Night from the same year",
				title: "It",
				year: 2017,
				releases: ["It.Comes.at.Night.2017.1080p-YTS", "It.2017.720p-YTS"],
				expected: "It.2017.720p-YTS",
				query: "it 2017",
			},
			{
				name: "selects Up over the higher-quality Up in the Air from the same year",
				title: "Up",
				year: 2009,
				releases: ["Up.In.The.Air.2009.1080p-YTS", "Up.2009.720p-YTS"],
				expected: "Up.2009.720p-YTS",
				query: "up 2009",
			},
			{
				name: "selects Us over the higher-quality Hustlers despite the substring and same year",
				title: "Us",
				year: 2019,
				releases: ["Hustlers.2019.1080p-YTS", "Us.2019.720p-YTS"],
				expected: "Us.2019.720p-YTS",
				query: "us 2019",
			},
			{
				name: "rejects a different release year",
				title: "Dune",
				year: 2021,
				releases: ["Dune.1984.1080p-YTS"],
				expected: undefined,
				query: "dune 2021",
			},
			{
				name: "rejects an unverified year when the requested year is known",
				title: "Dune",
				year: 2021,
				releases: ["Dune.1080p-YTS"],
				expected: undefined,
				query: "dune 2021",
			},
			{
				name: "allows an exact title when the requested year is unknown",
				title: "Dune",
				year: null,
				releases: ["Dune.1984.1080p-YTS"],
				expected: "Dune.1984.1080p-YTS",
				query: "dune",
			},
		])("$name", async ({ title, year, releases, expected, query }) => {
			mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () =>
					releases.map((release) => ({
						title: release,
						magnetUrl: `magnet:?xt=urn:btih:${release}`,
						infoHash: release,
						size: 2_000_000_000,
						seeders: 50,
					})),
			});

			const result = await findBestTorrent("tt1234567", { mediaType: "movie", title, year });

			expect(result?.title).toBe(expected);
			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(new URL(mockFetch.mock.calls[1][0] as string).searchParams.get("query")).toBe(query);
		});

		it.each(["你好", "   ", "!!!"])("does not search an empty normalized title: %s", async (title) => {
			mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

			const result = await findBestTorrent("tt1234567", { mediaType: "movie", title, year: 2024 });

			expect(result).toBeNull();
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("searchSourceCandidates", () => {
		const rawResults = [
			{
				downloadUrl: "http://localhost:9696/1/download?apikey=secret&link=abc",
				infoHash: "aaa",
				seeders: 10,
				size: 1_000_000_000,
				title: "Movie.2024.720p.WEBRip-GROUP",
			},
			{
				infoHash: "bbb",
				magnetUrl: "magnet:?xt=urn:btih:bbb",
				seeders: 200,
				size: 2_000_000_000,
				title: "Movie.2024.1080p.BluRay-GROUP",
			},
			{
				infoHash: "ccc",
				magnetUrl: "magnet:?xt=urn:btih:ccc",
				seeders: 900,
				size: 700_000_000,
				title: "Movie.2024.CAM.XviD",
			},
			{
				infoHash: "BBB",
				magnetUrl: "magnet:?xt=urn:btih:bbb",
				seeders: 200,
				size: 2_000_000_000,
				title: "Movie.2024.1080p.BluRay-GROUP",
			},
		];

		it("keeps every acceptable release, best first, without duplicates", async () => {
			mockFetch.mockResolvedValueOnce({ json: async () => rawResults, ok: true });

			const results = await searchSourceCandidates("Movie 2024", false);

			expect(results.map((result) => result.infohash)).toEqual(["bbb", "aaa"]);
		});

		it("searches the TV category for an episode", async () => {
			mockFetch.mockResolvedValueOnce({ json: async () => [], ok: true });

			await searchSourceCandidates("Show S01E02", true);

			const url = mockFetch.mock.calls[0][0] as string;
			expect(url).toContain("categories=5000");
		});

		it("strips the Prowlarr API key from download links", async () => {
			mockFetch.mockResolvedValueOnce({ json: async () => rawResults, ok: true });

			const results = await searchSourceCandidates("Movie 2024", false);

			const downloadLink = results.find((result) => result.infohash === "aaa");
			expect(downloadLink?.magnetUri).toBe("http://localhost:9696/1/download?link=abc");
		});
	});

	describe("Season Search", () => {
		const createSeasonResult = (title: string, seeders = 50, size = 5_000_000_000): IndexerResult => ({
			indexer: "Test",
			infohash: title,
			magnetUri: `magnet:?xt=urn:btih:${title}`,
			seeders,
			size,
			title,
		});

		describe("searchSeasonTorrent", () => {
			it("should search with multiple queries", async () => {
				mockFetch.mockResolvedValue({
					json: async () => [],
					ok: true,
				});

				await import("$lib/server/prowlarr").then((m) => m.searchSeasonTorrent("Show Title", 1, "tt1234567"));

				// Should try IMDB search first
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining("query=imdb%3Att1234567+S01"),
					expect.any(Object)
				);
				// Then title searches
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining("query=Show+Title+S01"),
					expect.any(Object)
				);
			});
		});

		describe("findBestSeasonTorrent", () => {
			it("should return null when no results found", async () => {
				mockFetch.mockResolvedValue({
					json: async () => [],
					ok: true,
				});

				const { findBestSeasonTorrent } = await import("$lib/server/prowlarr");
				const result = await findBestSeasonTorrent("Show", 1);
				expect(result).toBeNull();
			});
		});
	});

	describe("Episode Fallback Search", () => {
		const createEpisodeResult = (title: string, seeders = 50): IndexerResult => ({
			indexer: "Test",
			infohash: `${title}-${seeders}`.toLowerCase(),
			magnetUri: `magnet:?xt=urn:btih:${seeders}`,
			seeders,
			size: 2_000_000_000,
			title,
		});

		it("falls back from imdb to show season episode queries", async () => {
			mockFetch.mockResolvedValueOnce({ json: async () => [], ok: true });
			mockFetch.mockResolvedValueOnce({ json: async () => [], ok: true });
			mockFetch.mockResolvedValueOnce({
				json: async () => [
					{
						infoHash: "abc123",
						magnetUrl: "magnet:?xt=urn:btih:abc123",
						seeders: 25,
						size: 2_147_483_648,
						title: "Show Title S01E02 1080p WEB-DL-TEST",
					},
				],
				ok: true,
			});

			const result = await findBestTorrent("tt1234567", {
				episodeNumber: 2,
				episodeTitle: "Episode Name",
				mediaType: "episode",
				seasonNumber: 1,
				showTitle: "Show Title",
			});

			expect(result?.title).toBe("Show Title S01E02 1080p WEB-DL-TEST");
			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("query=tt1234567"), expect.any(Object));
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("query=Show+Title+S01E02"),
				expect.any(Object)
			);
		});

		it("filters season packs out of fallback episode matches", async () => {
			mockFetch.mockResolvedValue({
				json: async () => [
					{
						infoHash: "seasonpack",
						magnetUrl: "magnet:?xt=urn:btih:seasonpack",
						seeders: 100,
						size: 9_000_000_000,
						title: "Show Title Season 1 Complete 1080p",
					},
				],
				ok: true,
			});

			const result = await findBestTorrent("tt1234567", {
				episodeNumber: 2,
				mediaType: "episode",
				seasonNumber: 1,
				showTitle: "Show Title",
			});

			expect(result).toBeNull();
		});
	});
});
