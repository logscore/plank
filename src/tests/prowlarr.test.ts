import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	filterByQuality,
	filterByReleaseGroup,
	type IndexerResult,
	parseProwlarrResults,
	searchProwlarr,
	selectBestTorrent,
} from '$lib/server/prowlarr';

// Mock config
vi.mock('$lib/config', () => ({
	config: {
		prowlarr: {
			url: 'http://localhost:9696',
			apiKey: 'test-api-key',
			trustedGroups: ['YTS', 'YIFY', 'BONE'],
			minSeeders: 5,
		},
	},
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Prowlarr Client', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('parseProwlarrResults', () => {
		it('should parse Prowlarr JSON response', () => {
			const mockResponse = [
				{
					title: 'Movie.2024.1080p.BluRay.x264-YTS',
					magnetUrl: 'magnet:?xt=urn:btih:abc123',
					infoHash: 'abc123',
					size: 2_147_483_648,
					seeders: 150,
					leechers: 50,
					publishDate: '2024-01-15T12:00:00Z',
					indexer: 'YTS',
					guid: 'http://example.com/1',
				},
				{
					title: 'Movie.2024.720p.WEB-DL-RARBG',
					downloadUrl: 'magnet:?xt=urn:btih:def456',
					infoHash: 'def456',
					size: 1_073_741_824,
					seeders: 75,
					leechers: 25,
					publishDate: '2024-01-14T10:00:00Z',
					indexer: 'RARBG',
					guid: 'http://example.com/2',
				},
			];

			const results = parseProwlarrResults(mockResponse);

			expect(results).toHaveLength(2);
			expect(results[0].title).toBe('Movie.2024.1080p.BluRay.x264-YTS');
			expect(results[0].magnetUri).toBe('magnet:?xt=urn:btih:abc123');
			expect(results[0].infohash).toBe('abc123');
			expect(results[0].size).toBe(2_147_483_648);
			expect(results[0].seeders).toBe(150);
			expect(results[0].indexer).toBe('YTS');
		});

		it('should handle empty results', () => {
			const results = parseProwlarrResults([]);
			expect(results).toHaveLength(0);
		});

		it('should filter out results without magnet links or infohash', () => {
			const mockResponse = [
				{
					title: 'Movie.2024.1080p.BluRay',
					magnetUrl: 'magnet:?xt=urn:btih:abc123',
					infoHash: 'abc123',
					size: 2_147_483_648,
					seeders: 100,
					publishDate: '2024-01-15T12:00:00Z',
					guid: '1',
				},
				{
					title: 'Movie.2024.720p.WEB-DL',
					// No magnet
					size: 1_073_741_824,
					seeders: 50,
					publishDate: '2024-01-15T12:00:00Z',
					guid: '2',
				},
			];

			const results = parseProwlarrResults(mockResponse as any);
			expect(results).toHaveLength(1);
			expect(results[0].title).toBe('Movie.2024.1080p.BluRay');
		});
	});

	describe('filterByReleaseGroup', () => {
		const createResult = (title: string, seeders = 100): IndexerResult => ({
			title,
			magnetUri: 'magnet:?xt=urn:btih:hash',
			infohash: 'hash',
			size: 2_147_483_648,
			seeders,
			peers: 50,
			publishDate: new Date().toISOString(),
			indexer: 'Test',
		});

		it('should filter for trusted release groups', () => {
			const results: IndexerResult[] = [
				createResult('Movie.2024.1080p.BluRay.x264-YTS'),
				createResult('Movie.2024.1080p.BluRay.x264-RARBG'),
				createResult('Movie.2024.1080p.BluRay.x264-BONE'),
				createResult('Movie.2024.1080p.WEB-DL-YIFY'),
			];

			const trustedGroups = ['YTS', 'YIFY', 'BONE'];
			const filtered = filterByReleaseGroup(results, trustedGroups);

			expect(filtered).toHaveLength(3);
			expect(filtered.map((r) => r.title)).toEqual([
				'Movie.2024.1080p.BluRay.x264-YTS',
				'Movie.2024.1080p.BluRay.x264-BONE',
				'Movie.2024.1080p.WEB-DL-YIFY',
			]);
		});

		it('should return all results if no trusted groups specified', () => {
			const results: IndexerResult[] = [
				createResult('Movie.2024.1080p.BluRay.x264-YTS'),
				createResult('Movie.2024.1080p.BluRay.x264-RARBG'),
			];

			const filtered = filterByReleaseGroup(results, []);
			expect(filtered).toHaveLength(2);
		});
	});

	describe('filterByQuality', () => {
		const createResult = (title: string, seeders = 100): IndexerResult => ({
			title,
			magnetUri: 'magnet:?xt=urn:btih:hash',
			infohash: 'hash',
			size: 2_147_483_648,
			seeders,
			peers: 50,
			publishDate: new Date().toISOString(),
			indexer: 'Test',
		});

		it('should filter out low quality releases (CAM, TS, etc)', () => {
			const results: IndexerResult[] = [
				createResult('Movie.2024.1080p.BluRay.x264-YTS'),
				createResult('Movie.2024.CAM.x264-LOL'),
				createResult('Movie.2024.TS.x264-LOL'),
				createResult('Movie.2024.HDCAM.x264-LOL'),
				createResult('Movie.2024.720p.WEB-DL-YIFY'),
			];

			const filtered = filterByQuality(results);

			expect(filtered).toHaveLength(2);
			expect(filtered.map((r) => r.title)).toEqual([
				'Movie.2024.1080p.BluRay.x264-YTS',
				'Movie.2024.720p.WEB-DL-YIFY',
			]);
		});

		it('should keep high quality releases', () => {
			const results: IndexerResult[] = [
				createResult('Movie.2024.2160p.UHD.BluRay.x265-YTS'),
				createResult('Movie.2024.1080p.BluRay.x264-BONE'),
				createResult('Movie.2024.720p.BluRay.x264-YIFY'),
			];

			const filtered = filterByQuality(results);
			expect(filtered).toHaveLength(3);
		});
	});

	describe('selectBestTorrent', () => {
		const createResult = (title: string, seeders: number, size: number): IndexerResult => ({
			title,
			magnetUri: `magnet:?xt=urn:btih:${title}`,
			infohash: title,
			size,
			seeders,
			peers: Math.floor(seeders / 2),
			publishDate: new Date().toISOString(),
			indexer: 'Test',
		});

		it('should select torrent with most seeders', () => {
			const results: IndexerResult[] = [
				createResult('Movie.1080p-A', 50, 2_147_483_648),
				createResult('Movie.1080p-B', 200, 2_147_483_648),
				createResult('Movie.1080p-C', 100, 2_147_483_648),
			];

			const best = selectBestTorrent(results);
			expect(best?.title).toBe('Movie.1080p-B');
		});

		it('should return null for empty results', () => {
			const best = selectBestTorrent([]);
			expect(best).toBeNull();
		});

		it('should prefer higher quality when seeders are equal', () => {
			const results: IndexerResult[] = [
				createResult('Movie.2024.720p.BluRay-A', 50, 1_073_741_824),
				createResult('Movie.2024.1080p.BluRay-B', 50, 2_147_483_648),
			];

			// With equal seeders, 1080p should win due to quality score (80 vs 60)
			const best = selectBestTorrent(results);
			expect(best?.title).toBe('Movie.2024.1080p.BluRay-B');
		});
	});

	describe('searchProwlarr', () => {
		it('should search Prowlarr', async () => {
			const mockResponse = [
				{
					title: 'Movie.2024.1080p.BluRay.x264-YTS',
					magnetUrl: 'magnet:?xt=urn:btih:abc123',
					infoHash: 'abc123',
					size: 2_147_483_648,
					seeders: 150,
					publishDate: '2024-01-15T12:00:00Z',
					guid: '1',
				},
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const results = await searchProwlarr('tt1234567');

			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/search'), expect.any(Object));
			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('query=tt1234567'), expect.any(Object));
			expect(results).toHaveLength(1);
		});

		it('should handle API errors gracefully', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
			});

			const results = await searchProwlarr('tt1234567');
			expect(results).toEqual([]);
		});
	});

	describe('Season Search', () => {
		const createSeasonResult = (title: string, seeders = 50, size = 5_000_000_000): IndexerResult => ({
			title,
			magnetUri: `magnet:?xt=urn:btih:${title}`,
			infohash: title,
			size,
			seeders,
			peers: Math.floor(seeders / 2),
			publishDate: new Date().toISOString(),
			indexer: 'Test',
		});

		describe('searchSeasonTorrent', () => {
			it('should search with multiple queries', async () => {
				mockFetch.mockResolvedValue({
					ok: true,
					json: async () => [],
				});

				await import('$lib/server/prowlarr').then((m) => m.searchSeasonTorrent('Show Title', 1, 'tt1234567'));

				// Should try IMDB search first
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining('query=imdb%3Att1234567+S01'),
					expect.any(Object)
				);
				// Then title searches
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining('query=Show+Title+S01'),
					expect.any(Object)
				);
			});
		});

		describe('findBestSeasonTorrent', () => {
			it('should return null when no results found', async () => {
				mockFetch.mockResolvedValue({
					ok: true,
					json: async () => [],
				});

				const { findBestSeasonTorrent } = await import('$lib/server/prowlarr');
				const result = await findBestSeasonTorrent('Show', 1);
				expect(result).toBeNull();
			});
		});
	});
});
