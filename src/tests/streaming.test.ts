import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../routes/api/media/[id]/stream/+server';

// Mock dependencies
vi.mock('$lib/server/db', () => ({
	mediaDb: {
		get: vi.fn(),
	},
	episodesDb: {
		getById: vi.fn(),
	},
}));

vi.mock('$lib/server/torrent', () => ({
	getVideoStream: vi.fn(),
	getDownloadStatus: vi.fn(),
	isDownloadActive: vi.fn(),
	startDownload: vi.fn(),
	waitForVideoReady: vi.fn(),
}));

vi.mock('$lib/server/ffmpeg', () => ({
	createTransmuxStream: vi.fn(),
	needsTransmux: vi.fn(),
}));

vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		const err = new Error(message);
		(err as any).status = status;
		throw err;
	},
}));

import { episodesDb, mediaDb } from '$lib/server/db';
import { isDownloadActive, waitForVideoReady } from '$lib/server/torrent';

describe('Media Stream API', () => {
	const mockUser = { id: 'user-1', name: 'Test', email: 'test@test.com' };
	const mockLocals = { user: mockUser };

	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('should return 401 if unauthorized', async () => {
		await expect(
			GET({
				params: { id: 'media-1' },
				locals: { user: null },
				request: new Request('http://localhost'),
				url: new URL('http://localhost'),
			} as any)
		).rejects.toThrow();
	});

	it('should return 404 if media not found', async () => {
		vi.mocked(mediaDb.get).mockReturnValue(undefined);

		await expect(
			GET({
				params: { id: 'media-1' },
				locals: mockLocals,
				request: new Request('http://localhost'),
				url: new URL('http://localhost'),
			} as any)
		).rejects.toThrow('Media not found');
	});

	describe('Movie Streaming', () => {
		it('should call waitForVideoReady with undefined fileIndex', async () => {
			const mockMedia = {
				id: 'media-1',
				type: 'movie',
				magnetLink: 'magnet:?xt=urn:btih:123',
				status: 'added',
			};
			vi.mocked(mediaDb.get).mockReturnValue(mockMedia as any);
			vi.mocked(isDownloadActive).mockReturnValue(true); // Skip startDownload logic

			// Mock waitForVideoReady to return false (buffering) to stop execution before getVideoStream
			vi.mocked(waitForVideoReady).mockResolvedValue(false);

			const response = await GET({
				params: { id: 'media-1' },
				locals: mockLocals,
				request: new Request('http://localhost'),
				url: new URL('http://localhost'),
			} as any);

			expect(mediaDb.get).toHaveBeenCalledWith('media-1', 'user-1');
			expect(waitForVideoReady).toHaveBeenCalledWith(
				'media-1',
				undefined, // fileIndex
				30_000
			);
			expect(response.status).toBe(202);
		});
	});

	describe('TV Show Streaming', () => {
		it('should return 400 if episodeId is missing', async () => {
			const mockMedia = { id: 'media-1', type: 'tv' };
			vi.mocked(mediaDb.get).mockReturnValue(mockMedia as any);

			await expect(
				GET({
					params: { id: 'media-1' },
					locals: mockLocals,
					request: new Request('http://localhost'),
					url: new URL('http://localhost'),
				} as any)
			).rejects.toThrow('Episode ID required');
		});

		it('should return 404 if episode not found', async () => {
			const mockMedia = { id: 'media-1', type: 'tv' };
			vi.mocked(mediaDb.get).mockReturnValue(mockMedia as any);
			vi.mocked(episodesDb.getById).mockReturnValue(undefined);

			await expect(
				GET({
					params: { id: 'media-1' },
					locals: mockLocals,
					request: new Request('http://localhost'),
					url: new URL('http://localhost?episodeId=ep-1'),
				} as any)
			).rejects.toThrow('Episode not found');
		});

		it('should call waitForVideoReady with resolved fileIndex', async () => {
			const mockMedia = {
				id: 'media-1',
				type: 'tv',
				magnetLink: 'magnet:?xt=urn:btih:123',
				status: 'added',
			};
			const mockEpisode = { id: 'ep-1', fileIndex: 5 };

			vi.mocked(mediaDb.get).mockReturnValue(mockMedia as any);
			vi.mocked(episodesDb.getById).mockReturnValue(mockEpisode as any);
			vi.mocked(isDownloadActive).mockReturnValue(true);
			vi.mocked(waitForVideoReady).mockResolvedValue(false); // Return buffering

			await GET({
				params: { id: 'media-1' },
				locals: mockLocals,
				request: new Request('http://localhost'),
				url: new URL('http://localhost?episodeId=ep-1'),
			} as any);

			expect(episodesDb.getById).toHaveBeenCalledWith('ep-1');
			expect(waitForVideoReady).toHaveBeenCalledWith(
				'media-1',
				5, // fileIndex
				30_000
			);
		});

		it('should pass undefined fileIndex if episode has no fileIndex yet', async () => {
			const mockMedia = {
				id: 'media-1',
				type: 'tv',
				magnetLink: 'magnet:?xt=urn:btih:123',
				status: 'added',
			};
			const mockEpisode = { id: 'ep-1', fileIndex: null };

			vi.mocked(mediaDb.get).mockReturnValue(mockMedia as any);
			vi.mocked(episodesDb.getById).mockReturnValue(mockEpisode as any);
			vi.mocked(isDownloadActive).mockReturnValue(true);
			vi.mocked(waitForVideoReady).mockResolvedValue(false);

			await GET({
				params: { id: 'media-1' },
				locals: mockLocals,
				request: new Request('http://localhost'),
				url: new URL('http://localhost?episodeId=ep-1'),
			} as any);

			expect(waitForVideoReady).toHaveBeenCalledWith('media-1', undefined, 30_000);
		});
	});
});
