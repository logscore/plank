import { createQuery } from '@tanstack/svelte-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock svelte-query to capture calls
vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(),
	useQueryClient: vi.fn(),
	createMutation: vi.fn(),
}));

import { createSeasonsQuery, fetchSeasons, searchTMDB } from '$lib/queries/browse-queries';
import {
	createMediaDetailQuery,
	createMediaListQuery,
	createMediaProgressQuery,
	createSearchMediaQuery,
	fetchMediaDetail,
	fetchMediaList,
	fetchMediaProgress,
	searchMedia,
} from '$lib/queries/media-queries';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Client Queries', () => {
	beforeEach(() => {
		fetchMock.mockReset();
		vi.mocked(createQuery).mockClear();
	});

	describe('Media Queries', () => {
		it('fetchMediaList should call correct endpoint with params', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => [{ id: '1', title: 'Movie' }],
			});

			await fetchMediaList('movie');
			expect(fetchMock).toHaveBeenCalledWith('/api/media?type=movie');

			await fetchMediaList('all');
			expect(fetchMock).toHaveBeenCalledWith('/api/media');
		});

		it('fetchMediaDetail should call correct endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ id: '1', title: 'Movie' }),
			});

			await fetchMediaDetail('123');
			expect(fetchMock).toHaveBeenCalledWith('/api/media/123');
		});

		it('searchMedia should call search endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => [{ id: '1', title: 'Search Result' }],
			});

			await searchMedia('avatar');
			expect(fetchMock).toHaveBeenCalledWith('/api/media/search?q=avatar');
		});

		it('searchMedia should return empty array for short queries', async () => {
			const result = await searchMedia('a');
			expect(result).toEqual([]);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it('fetchMediaProgress should call progress endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ status: 'downloading', progress: 0.5 }),
			});

			await fetchMediaProgress('123');
			expect(fetchMock).toHaveBeenCalledWith('/api/media/123/progress');
		});
	});

	describe('Browse Queries', () => {
		it('fetchTrending should call trending endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ items: [], page: 1, totalPages: 1 }),
			});

			await import('$lib/queries/browse-queries').then((m) => m.fetchTrending('movie', 2));
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/browse?type=trending&filter=movie&page=2')
			);
		});

		it('fetchBrowse should call browse endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ items: [], page: 1, totalPages: 1 }),
			});

			await import('$lib/queries/browse-queries').then((m) => m.fetchBrowse('popular', 'tv', 1));
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining('/api/browse?type=popular&filter=tv&page=1')
			);
		});

		it('resolveTorrent should call resolve endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ success: true }),
			});

			const item = {
				imdbId: 'tt123',
				tmdbId: 456,
				title: 'Test Movie',
			};

			await import('$lib/queries/browse-queries').then((m) => m.resolveTorrent(item));
			expect(fetchMock).toHaveBeenCalledWith('/api/browse/resolve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(item),
			});
		});

		it('fetchJackettStatus should call status endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ jackettConfigured: true }),
			});

			await import('$lib/queries/browse-queries').then((m) => m.fetchJackettStatus());
			expect(fetchMock).toHaveBeenCalledWith('/api/jackett/status');
		});

		it('resolveSeasonTorrent should call resolve-season endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ success: true }),
			});

			const params = {
				tmdbId: 123,
				seasonNumber: 1,
				showTitle: 'Show',
			};

			await import('$lib/queries/browse-queries').then((m) => m.resolveSeasonTorrent(params));
			expect(fetchMock).toHaveBeenCalledWith('/api/browse/resolve-season', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params),
			});
		});

		it('searchTMDB should call TMDB search endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ results: [], page: 1, total_pages: 1 }),
			});

			await searchTMDB('matrix');
			expect(fetchMock).toHaveBeenCalledWith('/api/tmdb/search?q=matrix');
		});

		it('searchTMDB should handle empty/short queries', async () => {
			const result = await searchTMDB('a');
			expect(result.items).toEqual([]);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it('fetchSeasons should call seasons endpoint', async () => {
			fetchMock.mockResolvedValue({
				ok: true,
				json: async () => ({ seasons: [] }),
			});

			await fetchSeasons(12_345);
			expect(fetchMock).toHaveBeenCalledWith('/api/browse/seasons/12345');
		});
	});

	describe('TanStack Query Creators', () => {
		it('createMediaListQuery should configure query correctly', () => {
			createMediaListQuery('movie');
			expect(createQuery).toHaveBeenCalled();
			const optionsFn = vi.mocked(createQuery).mock.calls[0][0] as () => any;
			const options = optionsFn();
			expect(options).toEqual(
				expect.objectContaining({
					queryKey: ['media', 'list', 'movie'],
				})
			);
		});

		it('createMediaDetailQuery should configure query correctly', () => {
			createMediaDetailQuery('123');
			expect(createQuery).toHaveBeenCalled();
			const optionsFn = vi.mocked(createQuery).mock.calls[0][0] as () => any;
			const options = optionsFn();
			expect(options).toEqual(
				expect.objectContaining({
					queryKey: ['media', 'detail', '123'],
					enabled: true,
				})
			);
		});

		it('createSearchMediaQuery should configure query correctly', () => {
			createSearchMediaQuery(() => 'avatar');
			expect(createQuery).toHaveBeenCalled();
			const optionsFn = vi.mocked(createQuery).mock.calls[0][0] as () => any;
			const options = optionsFn();
			expect(options).toEqual(
				expect.objectContaining({
					queryKey: ['media', 'search', 'avatar'],
					enabled: true,
				})
			);
		});

		it('createMediaProgressQuery should configure query correctly', () => {
			createMediaProgressQuery('123');
			expect(createQuery).toHaveBeenCalled();
			const optionsFn = vi.mocked(createQuery).mock.calls[0][0] as () => any;
			const options = optionsFn();
			expect(options).toEqual(
				expect.objectContaining({
					queryKey: ['media', 'progress', '123'],
					refetchInterval: 1000,
				})
			);
		});

		it('createSeasonsQuery should configure query correctly', () => {
			createSeasonsQuery(123);
			expect(createQuery).toHaveBeenCalled();
			const optionsFn = vi.mocked(createQuery).mock.calls[0][0] as () => any;
			const options = optionsFn();
			expect(options).toEqual(
				expect.objectContaining({
					queryKey: ['browse', 'seasons', 123],
					staleTime: 3_600_000,
				})
			);
		});
	});

	describe('Error Handling', () => {
		it('fetchMediaList should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
			});

			await expect(fetchMediaList('all')).rejects.toThrow('Failed to fetch all media');
		});

		it('fetchMediaDetail should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 404,
				statusText: 'Not Found',
			});

			await expect(fetchMediaDetail('123')).rejects.toThrow('Failed to fetch media detail');
		});

		it('searchMedia should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			await expect(searchMedia('avatar')).rejects.toThrow('Failed to search media');
		});

		it('fetchMediaProgress should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			await expect(fetchMediaProgress('123')).rejects.toThrow('Failed to fetch progress');
		});

		it('fetchTrending should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			const { fetchTrending } = await import('$lib/queries/browse-queries');
			await expect(fetchTrending('all', 1)).rejects.toThrow('Failed to fetch trending');
		});

		it('fetchBrowse should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			const { fetchBrowse } = await import('$lib/queries/browse-queries');
			await expect(fetchBrowse('popular', 'movie', 1)).rejects.toThrow('Failed to fetch popular');
		});

		it('resolveTorrent should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			const { resolveTorrent } = await import('$lib/queries/browse-queries');
			await expect(resolveTorrent({ imdbId: 'tt', tmdbId: 1, title: 'T' })).rejects.toThrow(
				'Failed to resolve torrent'
			);
		});

		it('fetchJackettStatus should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			const { fetchJackettStatus } = await import('$lib/queries/browse-queries');
			await expect(fetchJackettStatus()).rejects.toThrow('Failed to fetch Jackett status');
		});

		it('searchTMDB should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			const { searchTMDB } = await import('$lib/queries/browse-queries');
			await expect(searchTMDB('query')).rejects.toThrow('Failed to search TMDB');
		});

		it('fetchSeasons should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			const { fetchSeasons } = await import('$lib/queries/browse-queries');
			await expect(fetchSeasons(123)).rejects.toThrow('Failed to fetch seasons');
		});

		it('resolveSeasonTorrent should throw error when response is not ok', async () => {
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: 'Error',
			});

			const { resolveSeasonTorrent } = await import('$lib/queries/browse-queries');
			await expect(resolveSeasonTorrent({ tmdbId: 1, seasonNumber: 1, showTitle: 'T' })).rejects.toThrow(
				'Failed to resolve season torrent'
			);
		});
	});
});
