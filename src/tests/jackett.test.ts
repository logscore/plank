import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	filterByQuality,
	filterByReleaseGroup,
	type JackettResult,
	parseJackettResults,
	searchJackett,
	selectBestTorrent,
} from '$lib/server/jackett';

// Mock config
vi.mock('$lib/config', () => ({
	config: {
		jackett: {
			url: 'http://localhost:9117',
			apiKey: 'test-api-key',
			trustedGroups: ['YTS', 'YIFY', 'BONE'],
			minSeeders: 5,
		},
	},
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Jackett Client', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('parseJackettResults', () => {
		it('should parse Jackett JSON response', () => {
			const mockResponse = {
				Results: [
					{
						Title: 'Movie.2024.1080p.BluRay.x264-YTS',
						MagnetUri: 'magnet:?xt=urn:btih:abc123',
						InfoHash: 'abc123',
						Size: 2_147_483_648,
						Seeders: 150,
						Peers: 50,
						PublishDate: '2024-01-15T12:00:00Z',
					},
					{
						Title: 'Movie.2024.720p.WEB-DL-RARBG',
						MagnetUri: 'magnet:?xt=urn:btih:def456',
						InfoHash: 'def456',
						Size: 1_073_741_824,
						Seeders: 75,
						Peers: 25,
						PublishDate: '2024-01-14T10:00:00Z',
					},
				],
			};

			const results = parseJackettResults(mockResponse);

			expect(results).toHaveLength(2);
			expect(results[0].title).toBe('Movie.2024.1080p.BluRay.x264-YTS');
			expect(results[0].magnetUri).toBe('magnet:?xt=urn:btih:abc123');
			expect(results[0].infohash).toBe('abc123');
			expect(results[0].size).toBe(2_147_483_648);
			expect(results[0].seeders).toBe(150);
		});

		it('should handle empty results', () => {
			const mockResponse = { Results: [] };
			const results = parseJackettResults(mockResponse);
			expect(results).toHaveLength(0);
		});

		it('should filter out results without magnet links', () => {
			const mockResponse = {
				Results: [
					{
						Title: 'Movie.2024.1080p.BluRay',
						MagnetUri: 'magnet:?xt=urn:btih:abc123',
						InfoHash: 'abc123',
						Size: 2_147_483_648,
						Seeders: 100,
						Peers: 50,
						PublishDate: '2024-01-15T12:00:00Z',
					},
					{
						Title: 'Movie.2024.720p.WEB-DL',
						MagnetUri: null,
						InfoHash: null,
						Size: 1_073_741_824,
						Seeders: 50,
						Peers: 25,
						PublishDate: '2024-01-15T12:00:00Z',
					},
				],
			};

			const results = parseJackettResults(mockResponse);
			expect(results).toHaveLength(1);
			expect(results[0].title).toBe('Movie.2024.1080p.BluRay');
		});
	});

	describe('filterByReleaseGroup', () => {
		const createResult = (title: string, seeders = 100): JackettResult => ({
			title,
			magnetUri: 'magnet:?xt=urn:btih:hash',
			infohash: 'hash',
			size: 2_147_483_648,
			seeders,
			peers: 50,
			publishDate: new Date().toISOString(),
		});

		it('should filter for trusted release groups', () => {
			const results: JackettResult[] = [
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
			const results: JackettResult[] = [
				createResult('Movie.2024.1080p.BluRay.x264-YTS'),
				createResult('Movie.2024.1080p.BluRay.x264-RARBG'),
			];

			const filtered = filterByReleaseGroup(results, []);
			expect(filtered).toHaveLength(2);
		});
	});

	describe('filterByQuality', () => {
		const createResult = (title: string, seeders = 100): JackettResult => ({
			title,
			magnetUri: 'magnet:?xt=urn:btih:hash',
			infohash: 'hash',
			size: 2_147_483_648,
			seeders,
			peers: 50,
			publishDate: new Date().toISOString(),
		});

		it('should filter out low quality releases (CAM, TS, etc)', () => {
			const results: JackettResult[] = [
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
			const results: JackettResult[] = [
				createResult('Movie.2024.2160p.UHD.BluRay.x265-YTS'),
				createResult('Movie.2024.1080p.BluRay.x264-BONE'),
				createResult('Movie.2024.720p.BluRay.x264-YIFY'),
			];

			const filtered = filterByQuality(results);
			expect(filtered).toHaveLength(3);
		});
	});

	describe('selectBestTorrent', () => {
		const createResult = (title: string, seeders: number, size: number): JackettResult => ({
			title,
			magnetUri: `magnet:?xt=urn:btih:${title}`,
			infohash: title,
			size,
			seeders,
			peers: Math.floor(seeders / 2),
			publishDate: new Date().toISOString(),
		});

		it('should select torrent with most seeders', () => {
			const results: JackettResult[] = [
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
			const results: JackettResult[] = [
				createResult('Movie.2024.720p.BluRay-A', 50, 1_073_741_824),
				createResult('Movie.2024.1080p.BluRay-B', 50, 2_147_483_648),
			];

			// With equal seeders, 1080p should win due to quality score (80 vs 60)
			const best = selectBestTorrent(results);
			expect(best?.title).toBe('Movie.2024.1080p.BluRay-B');
		});
	});

	describe('searchJackett', () => {
		it('should search Jackett with IMDB ID', async () => {
			const mockResponse = {
				Results: [
					{
						Title: 'Movie.2024.1080p.BluRay.x264-YTS',
						MagnetUri: 'magnet:?xt=urn:btih:abc123',
						InfoHash: 'abc123',
						Size: 2_147_483_648,
						Seeders: 150,
						Peers: 50,
						PublishDate: '2024-01-15T12:00:00Z',
					},
				],
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const results = await searchJackett('tt1234567');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/v2.0/indexers/all/results'),
				expect.any(Object)
			);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('Query=imdb%3Att1234567'),
				expect.any(Object)
			);
			expect(results).toHaveLength(1);
		});

		it('should handle API errors gracefully', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
			});

			const results = await searchJackett('tt1234567');
			expect(results).toEqual([]);
		});

		it('should handle network errors', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const results = await searchJackett('tt1234567');
			expect(results).toEqual([]);
		});
	});
});
