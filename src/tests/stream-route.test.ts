import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { episodesDb, mediaDb } from '$lib/server/db';
import * as ffmpeg from '$lib/server/ffmpeg';
import * as torrent from '$lib/server/torrent';
import { GET } from '../routes/api/media/[id]/stream/+server';

// Mock SvelteKit error
vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		const err = new Error(message);
		(err as any).status = status;
		return err;
	},
}));

// Mock DB
vi.mock('$lib/server/db', () => ({
	mediaDb: {
		get: vi.fn(),
	},
	episodesDb: {
		getById: vi.fn(),
	},
}));

// Mock Torrent Service
vi.mock('$lib/server/torrent', () => ({
	getDownloadStatus: vi.fn(),
	getVideoStream: vi.fn(),
	isDownloadActive: vi.fn(),
	startDownload: vi.fn(),
	waitForVideoReady: vi.fn(),
}));

// Mock FFmpeg
vi.mock('$lib/server/ffmpeg', () => ({
	createTransmuxStream: vi.fn(),
	needsTransmux: vi.fn(),
}));

describe('Stream API Route', () => {
	const mockUser = { id: 'user1', email: 'test@test.com' };
	const mockLocals = { user: mockUser };
	const mockMedia = {
		id: 'media1',
		type: 'movie',
		magnetLink: 'magnet:?xt=urn:btih:123',
		status: 'added',
	};

	beforeEach(() => {
		vi.clearAllMocks();
		(mediaDb.get as any).mockReturnValue(mockMedia);
		(torrent.getDownloadStatus as any).mockReturnValue({ status: 'downloading' });
		(torrent.isDownloadActive as any).mockReturnValue(true);
		(torrent.waitForVideoReady as any).mockResolvedValue(true);
		(ffmpeg.needsTransmux as any).mockReturnValue(false);
	});

	it('should throw 401 if unauthorized', async () => {
		const request = { headers: new Headers() } as Request;
		const event = {
			params: { id: 'media1' },
			locals: {}, // No user
			request,
			url: new URL('http://localhost/api/stream'),
		} as any;

		await expect(GET(event)).rejects.toMatchObject({ status: 401 });
	});

	it('should throw 404 if media not found', async () => {
		(mediaDb.get as any).mockReturnValue(null);
		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		await expect(GET(event)).rejects.toMatchObject({ status: 404 });
	});

	it('should throw 400 for TV show without episodeId', async () => {
		(mediaDb.get as any).mockReturnValue({ ...mockMedia, type: 'tv' });
		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		await expect(GET(event)).rejects.toMatchObject({ status: 400 });
	});

	it('should throw 404 if episode not found', async () => {
		(mediaDb.get as any).mockReturnValue({ ...mockMedia, type: 'tv' });
		(episodesDb.getById as any).mockReturnValue(null);
		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost?episodeId=ep1'),
		} as any;

		await expect(GET(event)).rejects.toMatchObject({ status: 404 });
	});

	it('should start download if not active', async () => {
		(torrent.isDownloadActive as any).mockReturnValue(false);
		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		// Mock stream info to avoid 404 later
		(torrent.getVideoStream as any).mockResolvedValue({
			fileSize: 1000,
			fileName: 'video.mp4',
			mimeType: 'video/mp4',
			stream: new Readable(),
			isComplete: false,
		});

		await GET(event);
		expect(torrent.startDownload).toHaveBeenCalledWith('media1', mockMedia.magnetLink);
	});

	it('should return 202 if buffering (initializing)', async () => {
		(torrent.waitForVideoReady as any).mockResolvedValue(false);
		(torrent.getDownloadStatus as any).mockReturnValue({ status: 'initializing' });

		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		const response = await GET(event);
		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body.message).toContain('initializing');
	});

	it('should return 202 if buffering (active)', async () => {
		(torrent.waitForVideoReady as any).mockResolvedValue(false);
		(torrent.getDownloadStatus as any).mockReturnValue({ status: 'downloading' });

		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		const response = await GET(event);
		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body.message).toContain('buffering');
	});

	it('should throw 503 if download error', async () => {
		(torrent.getDownloadStatus as any).mockReturnValue({ status: 'error', error: 'No peers' });

		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		await expect(GET(event)).rejects.toMatchObject({ status: 503 });
	});

	it('should handle transmuxing', async () => {
		(ffmpeg.needsTransmux as any).mockReturnValue(true);
		(ffmpeg.createTransmuxStream as any).mockReturnValue(new Readable());
		(torrent.getVideoStream as any).mockResolvedValue({
			fileSize: 1000,
			fileName: 'video.mkv',
			mimeType: 'video/x-matroska',
			stream: new Readable(),
			isComplete: false,
		});

		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		const response = await GET(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('video/mp4');
		expect(ffmpeg.createTransmuxStream).toHaveBeenCalled();
	});

	it('should handle full file stream', async () => {
		(torrent.getVideoStream as any).mockResolvedValue({
			fileSize: 1000,
			fileName: 'video.mp4',
			mimeType: 'video/mp4',
			stream: new Readable(),
			isComplete: true,
		});

		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request: new Request('http://localhost'),
			url: new URL('http://localhost'),
		} as any;

		const response = await GET(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Length')).toBe('1000');
		expect(response.headers.get('Cache-Control')).toContain('private');
	});

	it('should handle range request', async () => {
		const mockStream = new Readable();
		mockStream._read = () => {};
		const destroySpy = vi.spyOn(mockStream, 'destroy');

		// First call for metadata
		(torrent.getVideoStream as any)
			.mockResolvedValueOnce({
				fileSize: 1000,
				fileName: 'video.mp4',
				mimeType: 'video/mp4',
				stream: mockStream,
				isComplete: false,
			})
			// Second call for actual range stream
			.mockResolvedValueOnce({
				fileSize: 1000,
				fileName: 'video.mp4',
				mimeType: 'video/mp4',
				stream: new Readable(),
				isComplete: false,
			});

		const request = new Request('http://localhost', {
			headers: { Range: 'bytes=0-499' },
		});

		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request,
			url: new URL('http://localhost'),
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Range')).toBe('bytes 0-499/1000');
		expect(response.headers.get('Content-Length')).toBe('500');
		expect(destroySpy).toHaveBeenCalled(); // Should destroy the initial stream used for metadata
	});

	it('should throw 416 for invalid range', async () => {
		(torrent.getVideoStream as any).mockResolvedValue({
			fileSize: 1000,
			fileName: 'video.mp4',
			mimeType: 'video/mp4',
			stream: new Readable(),
			isComplete: false,
		});

		const request = new Request('http://localhost', {
			headers: { Range: 'bytes=2000-3000' }, // Out of bounds
		});

		const event = {
			params: { id: 'media1' },
			locals: mockLocals,
			request,
			url: new URL('http://localhost'),
		} as any;

		await expect(GET(event)).rejects.toMatchObject({ status: 416 });
	});
});
