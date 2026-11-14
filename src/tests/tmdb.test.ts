// TODO: unreviewed

import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSettings } from "$lib/server/settings";
import * as tmdb from "$lib/server/tmdb";

describe("TMDB Service", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		await updateSettings({ tmdbApiKey: "" });
	});

	describe("settings integration", () => {
		it("uses TMDB API key from env when DB setting is empty", async () => {
			(global.fetch as any).mockResolvedValue({
				json: async () => ({ results: [] }),
				ok: true,
			});

			await tmdb.searchMovie("Test");

			const url = (global.fetch as any).mock.calls[0][0] as string;
			expect(url).toContain("api_key=test-tmdb-api-key");
		});

		it("uses TMDB API key from DB over env", async () => {
			await updateSettings({ tmdbApiKey: "db-tmdb-api-key" });
			(global.fetch as any).mockResolvedValue({
				json: async () => ({ results: [] }),
				ok: true,
			});

			await tmdb.searchMovie("Test");

			const url = (global.fetch as any).mock.calls[0][0] as string;
			expect(url).toContain("api_key=db-tmdb-api-key");
			expect(url).not.toContain("test-tmdb-api-key");
		});
	});

	describe("searchMovie", () => {
		it("should search and parse results", async () => {
			const mockResponse = {
				results: [
					{
						backdrop_path: "/backdrop.jpg",
						id: 100,
						overview: "Overview",
						poster_path: "/poster.jpg",
						release_date: "2020-01-01",
						title: "Test Movie",
					},
				],
			};
			(global.fetch as any).mockResolvedValue({
				json: async () => mockResponse,
				ok: true,
			});

			const results = await tmdb.searchMovie("Test");

			expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/search/movie"));
			expect(results).toHaveLength(1);
			expect(results[0].tmdbId).toBe(100);
			expect(results[0].year).toBe(2020);
			expect(results[0].posterUrl).toBe("https://image.tmdb.org/t/p/w342/poster.jpg");
		});

		it("should handle empty results", async () => {
			(global.fetch as any).mockResolvedValue({
				json: async () => ({ results: [] }),
				ok: true,
			});
			const results = await tmdb.searchMovie("Nothing");
			expect(results).toHaveLength(0);
		});
	});

	describe("getMovieDetails", () => {
		it("should fetch details and certification", async () => {
			const mockMovie = {
				backdrop_path: "/backdrop.jpg",
				genres: [{ id: 1, name: "Action" }],
				id: 100,
				original_language: "en",
				overview: "Overview",
				poster_path: "/poster.jpg",
				release_date: "2020-01-01",
				release_dates: {
					results: [
						{
							iso_3166_1: "US",
							release_dates: [{ certification: "PG-13", type: 3 }],
						},
					],
				},
				runtime: 120,
				title: "Test Movie",
			};

			(global.fetch as any).mockResolvedValueOnce({ json: async () => mockMovie, ok: true });

			const details = await tmdb.getMovieDetails(100);

			expect(details.tmdbId).toBe(100);
			expect(details.runtime).toBe(120);
			expect(details.certification).toBe("PG-13");
			expect(details.genres).toContain("Action");
		});
	});

	describe("catalog search", () => {
		it("sends discover filters and rejects adult results", async () => {
			const fetchMock = vi.mocked(global.fetch);
			fetchMock.mockResolvedValue(
				Response.json({
					page: 2,
					results: [
						{
							adult: true,
							genre_ids: [28],
							id: 1,
							popularity: 100,
							release_date: "2010-01-01",
							title: "Adult",
							vote_average: 9,
						},
						{
							adult: false,
							genre_ids: [28],
							id: 2,
							popularity: 90,
							release_date: "2012-01-01",
							title: "Low rated",
							vote_average: 6,
						},
						{
							adult: false,
							genre_ids: [28],
							id: 3,
							popularity: 80,
							release_date: "2015-01-01",
							title: "Visible",
							vote_average: 8,
						},
					],
					total_pages: 4,
					total_results: 3,
				})
			);

			const result = await tmdb.searchTmdbCatalog({
				filters: {
					genres: ["action"],
					media: "movie",
					rating: 7,
					scope: "catalog",
					sort: "rating",
					yearFrom: 2000,
					yearTo: 2020,
				},
				page: 2,
				query: "",
			});

			const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
			expect(url.pathname).toBe("/3/discover/movie");
			expect(url.searchParams.get("include_adult")).toBe("false");
			expect(url.searchParams.get("vote_average.gte")).toBe("7");
			expect(url.searchParams.get("primary_release_date.gte")).toBe("2000-01-01");
			expect(url.searchParams.get("primary_release_date.lte")).toBe("2020-12-31");
			expect(url.searchParams.get("with_genres")).toBe("28");
			expect(result.items.map((item) => item.title)).toEqual(["Visible"]);
			expect(result.totalPages).toBe(4);
		});
	});
	describe("isTVShowFilename", () => {
		it("should identify TV show patterns", () => {
			expect(tmdb.isTVShowFilename("Show.S01E01.mkv")).toBe(true);
			expect(tmdb.isTVShowFilename("Show.1x01.mkv")).toBe(true);
			expect(tmdb.isTVShowFilename("Show.Season.1.mkv")).toBe(true);
			expect(tmdb.isTVShowFilename("Show - 01 [1080p].mkv")).toBe(true); // Anime
			expect(tmdb.isTVShowFilename("Show.2024.10.10.mkv")).toBe(true); // Date based
		});

		it("should return false for movies", () => {
			expect(tmdb.isTVShowFilename("Movie.2024.1080p.mkv")).toBe(false);
			expect(tmdb.isTVShowFilename("Movie (2024).mkv")).toBe(false);
		});
	});

	describe("TV Show Queries", () => {
		it("searchTVShow should parse results", async () => {
			const mockResponse = {
				results: [
					{
						backdrop_path: "/backdrop.jpg",
						first_air_date: "2020-01-01",
						id: 200,
						name: "Test Show",
						number_of_seasons: 5,
						overview: "Overview",
						poster_path: "/poster.jpg",
					},
				],
			};
			(global.fetch as any).mockResolvedValue({
				json: async () => mockResponse,
				ok: true,
			});

			const results = await tmdb.searchTVShow("Test");

			expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/search/tv"));
			expect(results).toHaveLength(1);
			expect(results[0].tmdbId).toBe(200);
			expect(results[0].title).toBe("Test Show");
			expect(results[0].totalSeasons).toBe(5);
		});

		it("getTVDetails should fetch details and ratings", async () => {
			const mockShow = {
				content_ratings: {
					results: [
						{
							iso_3166_1: "US",
							rating: "TV-14",
						},
					],
				},
				episode_run_time: [30],
				first_air_date: "2020-01-01",
				genres: [{ id: 1, name: "Comedy" }],
				id: 200,
				name: "Test Show",
				number_of_seasons: 5,
			};

			(global.fetch as any).mockResolvedValueOnce({ json: async () => mockShow, ok: true });

			const details = await tmdb.getTVDetails(200);

			expect(details.tmdbId).toBe(200);
			expect(details.runtime).toBe(30);
			expect(details.certification).toBe("TV-14");
			expect(details.totalSeasons).toBe(5);
		});

		it("getTVSeasons should fetch seasons", async () => {
			const mockShow = {
				seasons: [
					{ episode_count: 5, name: "Specials", season_number: 0 },
					{ episode_count: 10, name: "Season 1", season_number: 1 },
				],
			};

			(global.fetch as any).mockResolvedValue({
				json: async () => mockShow,
				ok: true,
			});

			const seasons = await tmdb.getTVSeasons(200);

			expect(seasons).toHaveLength(1); // Should exclude specials by default
			expect(seasons[0].seasonNumber).toBe(1);
			expect(seasons[0].episodeCount).toBe(10);
		});

		it("getSeasonDetails should fetch episodes", async () => {
			const mockSeason = {
				episodes: [
					{ episode_number: 1, name: "Pilot", overview: "Intro" },
					{ episode_number: 2, name: "Ep 2", overview: "Next" },
				],
				name: "Season 1",
				season_number: 1,
			};

			(global.fetch as any).mockResolvedValue({
				json: async () => mockSeason,
				ok: true,
			});

			const details = await tmdb.getSeasonDetails(200, 1);

			expect(details.seasonNumber).toBe(1);
			expect(details.episodes).toHaveLength(2);
			expect(details.episodes[0].title).toBe("Pilot");
		});

		it("getSeasonDetailsWithExternalIds should include episode imdb ids", async () => {
			const mockSeason = {
				episodes: [
					{ episode_number: 1, id: 1001, name: "Pilot", overview: "Intro" },
					{ episode_number: 2, id: 1002, name: "Ep 2", overview: "Next" },
				],
				name: "Season 1",
				season_number: 1,
			};

			(global.fetch as any)
				.mockResolvedValueOnce({ json: async () => mockSeason, ok: true })
				.mockResolvedValueOnce({ json: async () => ({ imdb_id: "tt1001" }), ok: true })
				.mockResolvedValueOnce({ json: async () => ({ imdb_id: "tt1002" }), ok: true });

			const details = await tmdb.getSeasonDetailsWithExternalIds(200, 1);

			expect(details.episodes).toHaveLength(2);
			expect(details.episodes[0].tmdbId).toBe(1001);
			expect(details.episodes[0].imdbId).toBe("tt1001");
			expect(details.episodes[1].imdbId).toBe("tt1002");
		});
	});

	describe("Trending", () => {
		it("getTrending should parse results", async () => {
			const mockResponse = {
				page: 1,
				results: [
					{
						genre_ids: [28],
						id: 1,
						media_type: "movie",
						poster_path: "/p.jpg",
						title: "Movie",
					},
					{
						genre_ids: [35],
						id: 2,
						media_type: "show",
						name: "Show",
						poster_path: "/p.jpg",
					},
					{
						id: 3,
						media_type: "person",
						name: "Person",
						poster_path: "/person.jpg",
					},
				],
				total_pages: 10,
			};

			(global.fetch as any).mockResolvedValue({
				json: async () => mockResponse,
				ok: true,
			});

			const result = await tmdb.getTrending();

			expect(result.items).toHaveLength(2);
			expect(result.items[0].mediaType).toBe("movie");
			expect(result.items[1].mediaType).toBe("show");
			expect(result.totalPages).toBe(10);
		});
	});

	describe("Error Handling", () => {
		it("getMovieDetails should throw on error", async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 404,
			});

			await expect(tmdb.getMovieDetails(999)).rejects.toThrow("TMDB API error: 404");
		});

		it("getMovieDetails should throw on invalid response", async () => {
			(global.fetch as any).mockResolvedValue({
				json: async () => ({}), // Missing ID
				ok: true,
			});

			await expect(tmdb.getMovieDetails(999)).rejects.toThrow("Invalid TMDB response");
		});

		it("getTVDetails should throw on error", async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 500,
			});

			await expect(tmdb.getTVDetails(999)).rejects.toThrow("TMDB API error: 500");
		});

		it("getTVSeasons should handle API error", async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 401,
			});

			await expect(tmdb.getTVSeasons(999)).rejects.toThrow("TMDB API error: 401");
		});

		it("getSeasonDetails should handle API error", async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 404,
			});

			await expect(tmdb.getSeasonDetails(999, 1)).rejects.toThrow("TMDB API error: 404");
		});
	});

	describe("Browsing", () => {
		it("getBrowseItemDetails should return nulls on error", async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
			});

			const result = await tmdb.getBrowseItemDetails(1, "movie");
			expect(result).toEqual({ certification: null, imdbId: null });
		});

		it("getBrowseItemDetails should parse movie release dates", async () => {
			const mockData = {
				external_ids: { imdb_id: "tt123" },
				release_dates: {
					results: [
						{
							iso_3166_1: "US",
							release_dates: [{ certification: "PG-13", type: 3 }],
						},
					],
				},
			};

			(global.fetch as any).mockResolvedValue({
				json: async () => mockData,
				ok: true,
			});

			const result = await tmdb.getBrowseItemDetails(1, "movie");
			expect(result.imdbId).toBe("tt123");
			expect(result.certification).toBe("PG-13");
		});

		it("getBrowseItemDetails should parse TV content ratings", async () => {
			const mockData = {
				content_ratings: {
					results: [{ iso_3166_1: "US", rating: "TV-MA" }],
				},
				external_ids: { imdb_id: "tt456" },
			};

			(global.fetch as any).mockResolvedValue({
				json: async () => mockData,
				ok: true,
			});

			const result = await tmdb.getBrowseItemDetails(1, "show");
			expect(result.imdbId).toBe("tt456");
			expect(result.certification).toBe("TV-MA");
		});
	});
});
