import { beforeEach, describe, expect, it, vi } from 'vitest';
import { imageStorage } from '$lib/server/storage';
import * as tmdb from '$lib/server/tmdb';

// Mock config
vi.mock('$lib/config', () => ({
	config: {
		tmdb: {
			apiKey: 'test-key',
			baseUrl: 'https://api.tmdb.org/3',
			imageBaseUrl: 'https://image.tmdb.org/t/p',
		},
	},
}));

// Mock image storage
vi.mock('$lib/server/storage', () => ({
	imageStorage: {
		saveFromUrl: vi.fn(),
	},
}));

describe('TMDB Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	describe('searchMovie', () => {
		it('should search and parse results', async () => {
			const mockResponse = {
				results: [
					{
						id: 100,
						title: 'Test Movie',
						release_date: '2020-01-01',
						poster_path: '/poster.jpg',
						backdrop_path: '/backdrop.jpg',
						overview: 'Overview',
					},
				],
			};
			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const results = await tmdb.searchMovie('Test');

			expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search/movie'));
			expect(results).toHaveLength(1);
			expect(results[0].tmdbId).toBe(100);
			expect(results[0].year).toBe(2020);
			expect(results[0].posterUrl).toBe('https://image.tmdb.org/t/p/w342/poster.jpg');
		});

		it('should handle empty results', async () => {
			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => ({ results: [] }),
			});
			const results = await tmdb.searchMovie('Nothing');
			expect(results).toHaveLength(0);
		});
	});

	describe('getMovieDetails', () => {
		it('should fetch details and certification', async () => {
			const mockMovie = {
				id: 100,
				title: 'Test Movie',
				release_date: '2020-01-01',
				poster_path: '/poster.jpg',
				backdrop_path: '/backdrop.jpg',
				overview: 'Overview',
				runtime: 120,
				genres: [{ id: 1, name: 'Action' }],
				original_language: 'en',
			};

			const mockReleaseDates = {
				results: [
					{
						iso_3166_1: 'US',
						release_dates: [{ certification: 'PG-13', type: 3 }],
					},
				],
			};

			(global.fetch as any)
				.mockResolvedValueOnce({ ok: true, json: async () => mockMovie }) // Movie details
				.mockResolvedValueOnce({ ok: true, json: async () => mockReleaseDates }); // Release dates

			const details = await tmdb.getMovieDetails(100);

			expect(details.tmdbId).toBe(100);
			expect(details.runtime).toBe(120);
			expect(details.certification).toBe('PG-13');
			expect(details.genres).toContain('Action');
		});
	});

	describe('saveTmdbImages', () => {
		it('should save poster and backdrop if present', async () => {
			const metadata: any = {
				posterUrl: 'http://url/poster.jpg',
				backdropUrl: 'http://url/backdrop.jpg',
			};

			(imageStorage.saveFromUrl as any)
				.mockResolvedValueOnce('library/1/poster.jpg')
				.mockResolvedValueOnce('library/1/backdrop.jpg');

			const result = await tmdb.saveTmdbImages(metadata, 'library', '1');

			expect(imageStorage.saveFromUrl).toHaveBeenCalledTimes(2);
			expect(result.posterUrl).toBe('/images/library/1/poster.jpg');
			expect(result.backdropUrl).toBe('/images/library/1/backdrop.jpg');
		});

		it('should return original URLs if save fails', async () => {
			const metadata: any = {
				posterUrl: 'http://url/poster.jpg',
				backdropUrl: null,
			};

			(imageStorage.saveFromUrl as any).mockRejectedValue(new Error('Failed'));

			// Mock console.error to avoid noise
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await tmdb.saveTmdbImages(metadata, 'library', '1');

			expect(result.posterUrl).toBe('http://url/poster.jpg'); // Unchanged
			expect(consoleSpy).toHaveBeenCalled();
		});
	});

	describe('isTVShowFilename', () => {
		it('should identify TV show patterns', () => {
			expect(tmdb.isTVShowFilename('Show.S01E01.mkv')).toBe(true);
			expect(tmdb.isTVShowFilename('Show.1x01.mkv')).toBe(true);
			expect(tmdb.isTVShowFilename('Show.Season.1.mkv')).toBe(true);
			expect(tmdb.isTVShowFilename('Show - 01 [1080p].mkv')).toBe(true); // Anime
			expect(tmdb.isTVShowFilename('Show.2024.10.10.mkv')).toBe(true); // Date based
		});

		it('should return false for movies', () => {
			expect(tmdb.isTVShowFilename('Movie.2024.1080p.mkv')).toBe(false);
			expect(tmdb.isTVShowFilename('Movie (2024).mkv')).toBe(false);
		});
	});

	describe('TV Show Queries', () => {
		it('searchTVShow should parse results', async () => {
			const mockResponse = {
				results: [
					{
						id: 200,
						name: 'Test Show',
						first_air_date: '2020-01-01',
						poster_path: '/poster.jpg',
						backdrop_path: '/backdrop.jpg',
						overview: 'Overview',
						number_of_seasons: 5,
					},
				],
			};
			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const results = await tmdb.searchTVShow('Test');

			expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search/tv'));
			expect(results).toHaveLength(1);
			expect(results[0].tmdbId).toBe(200);
			expect(results[0].title).toBe('Test Show');
			expect(results[0].totalSeasons).toBe(5);
		});

		it('getTVDetails should fetch details and ratings', async () => {
			const mockShow = {
				id: 200,
				name: 'Test Show',
				first_air_date: '2020-01-01',
				number_of_seasons: 5,
				episode_run_time: [30],
				genres: [{ id: 1, name: 'Comedy' }],
			};

			const mockRatings = {
				results: [
					{
						iso_3166_1: 'US',
						rating: 'TV-14',
					},
				],
			};

			(global.fetch as any)
				.mockResolvedValueOnce({ ok: true, json: async () => mockShow }) // Show details
				.mockResolvedValueOnce({ ok: true, json: async () => mockRatings }); // Content ratings

			const details = await tmdb.getTVDetails(200);

			expect(details.tmdbId).toBe(200);
			expect(details.runtime).toBe(30);
			expect(details.certification).toBe('TV-14');
			expect(details.totalSeasons).toBe(5);
		});

		it('getTVSeasons should fetch seasons', async () => {
			const mockShow = {
				seasons: [
					{ season_number: 0, name: 'Specials', episode_count: 5 },
					{ season_number: 1, name: 'Season 1', episode_count: 10 },
				],
			};

			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockShow,
			});

			const seasons = await tmdb.getTVSeasons(200);

			expect(seasons).toHaveLength(1); // Should exclude specials by default
			expect(seasons[0].seasonNumber).toBe(1);
			expect(seasons[0].episodeCount).toBe(10);
		});

		it('getSeasonDetails should fetch episodes', async () => {
			const mockSeason = {
				season_number: 1,
				name: 'Season 1',
				episodes: [
					{ episode_number: 1, name: 'Pilot', overview: 'Intro' },
					{ episode_number: 2, name: 'Ep 2', overview: 'Next' },
				],
			};

			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockSeason,
			});

			const details = await tmdb.getSeasonDetails(200, 1);

			expect(details.seasonNumber).toBe(1);
			expect(details.episodes).toHaveLength(2);
			expect(details.episodes[0].title).toBe('Pilot');
		});
	});

	describe('Trending & Popular', () => {
		it('getTrending should parse results', async () => {
			const mockResponse = {
				results: [
					{
						id: 1,
						title: 'Movie',
						media_type: 'movie',
						genre_ids: [28],
						poster_path: '/p.jpg',
					},
					{
						id: 2,
						name: 'Show',
						media_type: 'tv',
						genre_ids: [35],
						poster_path: '/p.jpg',
					},
				],
				page: 1,
				total_pages: 10,
			};

			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await tmdb.getTrending();

			expect(result.items).toHaveLength(2);
			expect(result.items[0].mediaType).toBe('movie');
			expect(result.items[1].mediaType).toBe('tv');
			expect(result.totalPages).toBe(10);
		});

		it('getPopular should parse results', async () => {
			const mockResponse = {
				results: [
					{
						id: 1,
						title: 'Movie',
						genre_ids: [28],
					},
				],
				page: 1,
				total_pages: 5,
			};

			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await tmdb.getPopular(1, 'movie');

			expect(result.items).toHaveLength(1);
			expect(result.items[0].mediaType).toBe('movie');
		});
	});

	describe('Error Handling', () => {
		it('getMovieDetails should throw on error', async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 404,
			});

			await expect(tmdb.getMovieDetails(999)).rejects.toThrow('TMDB API error: 404');
		});

		it('getMovieDetails should throw on invalid response', async () => {
			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => ({}), // Missing ID
			});

			await expect(tmdb.getMovieDetails(999)).rejects.toThrow('Invalid TMDB response');
		});

		it('getTVDetails should throw on error', async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 500,
			});

			await expect(tmdb.getTVDetails(999)).rejects.toThrow('TMDB API error: 500');
		});

		it('getTVSeasons should handle API error', async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 401,
			});

			await expect(tmdb.getTVSeasons(999)).rejects.toThrow('TMDB API error: 401');
		});

		it('getSeasonDetails should handle API error', async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 404,
			});

			await expect(tmdb.getSeasonDetails(999, 1)).rejects.toThrow('TMDB API error: 404');
		});
	});

	describe('Browsing', () => {
		it('getBrowseItemDetails should return nulls on error', async () => {
			(global.fetch as any).mockResolvedValue({
				ok: false,
			});

			const result = await tmdb.getBrowseItemDetails(1, 'movie');
			expect(result).toEqual({ imdbId: null, certification: null });
		});

		it('getBrowseItemDetails should parse movie release dates', async () => {
			const mockData = {
				external_ids: { imdb_id: 'tt123' },
				release_dates: {
					results: [
						{
							iso_3166_1: 'US',
							release_dates: [{ certification: 'PG-13', type: 3 }],
						},
					],
				},
			};

			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockData,
			});

			const result = await tmdb.getBrowseItemDetails(1, 'movie');
			expect(result.imdbId).toBe('tt123');
			expect(result.certification).toBe('PG-13');
		});

		it('getBrowseItemDetails should parse TV content ratings', async () => {
			const mockData = {
				external_ids: { imdb_id: 'tt456' },
				content_ratings: {
					results: [{ iso_3166_1: 'US', rating: 'TV-MA' }],
				},
			};

			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockData,
			});

			const result = await tmdb.getBrowseItemDetails(1, 'tv');
			expect(result.imdbId).toBe('tt456');
			expect(result.certification).toBe('TV-MA');
		});
	});
});
