import { beforeEach, describe, expect, it, vi } from 'vitest';
import { imageStorage } from '$lib/server/storage';
import * as tmdb from '$lib/server/tmdb';

// Mock config
vi.mock('$lib/config', () => ({
	config: {
		tmdb: {
			apiKey: 'test-key',
			baseUrl: 'https://api.tmdb.org/3',
			imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
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
				json: async () => mockResponse,
			});

			const results = await tmdb.searchMovie('Test');

			expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search/movie'));
			expect(results).toHaveLength(1);
			expect(results[0].tmdbId).toBe(100);
			expect(results[0].year).toBe(2020);
			expect(results[0].posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
		});

		it('should handle empty results', async () => {
			(global.fetch as any).mockResolvedValue({
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
				.mockResolvedValueOnce({ json: async () => mockMovie }) // Movie details
				.mockResolvedValueOnce({ json: async () => mockReleaseDates }); // Release dates

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
});
