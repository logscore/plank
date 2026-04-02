import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireMediaAccess } = vi.hoisted(() => ({
	requireMediaAccess: vi.fn(),
}));

vi.mock('$lib/server/api-guard', () => ({
	requireMediaAccess,
}));

vi.mock('$lib/server/torrent', () => ({
	getDownloadStatus: vi.fn(),
	getVideoStream: vi.fn(),
	isDownloadActive: vi.fn(),
	startDownload: vi.fn(),
	waitForVideoReady: vi.fn(),
}));

vi.mock('$lib/server/ffmpeg', () => ({
	createTransmuxStream: vi.fn((value) => value.inputStream),
	needsTransmux: vi.fn(() => false),
	requiresBrowserSafePlayback: vi.fn(() => Promise.resolve(false)),
}));

import * as ffmpeg from '$lib/server/ffmpeg';
import * as torrent from '$lib/server/torrent';
import { GET, HEAD } from '../routes/api/media/[id]/stream/+server';

describe('stream route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(torrent.isDownloadActive).mockReturnValue(false);
		vi.mocked(torrent.waitForVideoReady).mockResolvedValue(false);
		vi.mocked(ffmpeg.requiresBrowserSafePlayback).mockResolvedValue(false);
	});

	it('rejects show containers', async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: { id: 'show-1', type: 'show' },
		});

		await expect(
			GET({
				params: { id: 'show-1' },
				locals: {} as App.Locals,
				request: new Request('http://localhost'),
			} as never)
		).rejects.toMatchObject({ status: 400 });
	});

	it('streams completed episode library files directly', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'plank-stream-'));
		const filePath = path.join(directory, 'pilot.mp4');
		await writeFile(filePath, 'video');

		requireMediaAccess.mockReturnValue({
			mediaItem: {
				id: 'episode-1',
				type: 'episode',
				filePath,
				fileIndex: 0,
				magnetLink: null,
				status: 'complete',
			},
		});

		const response = await GET({
			params: { id: 'episode-1' },
			locals: {} as App.Locals,
			request: new Request('http://localhost'),
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('video/mp4');
		expect(vi.mocked(ffmpeg.createTransmuxStream)).not.toHaveBeenCalled();

		await rm(directory, { recursive: true, force: true });
	});

	it('rejects completed library files that are not direct-playback safe', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'plank-stream-'));
		const filePath = path.join(directory, 'pilot.mp4');
		await writeFile(filePath, 'video');

		requireMediaAccess.mockReturnValue({
			mediaItem: {
				id: 'episode-1',
				type: 'episode',
				filePath,
				fileIndex: 0,
				magnetLink: null,
				status: 'complete',
			},
		});
		vi.mocked(ffmpeg.requiresBrowserSafePlayback).mockResolvedValue(true);

		await expect(
			GET({
				params: { id: 'episode-1' },
				locals: {} as App.Locals,
				request: new Request('http://localhost'),
			} as never)
		).rejects.toMatchObject({ status: 503 });
		expect(vi.mocked(ffmpeg.createTransmuxStream)).not.toHaveBeenCalled();

		await rm(directory, { recursive: true, force: true });
	});

	it('returns buffering response while download is warming up', async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: {
				id: 'episode-1',
				type: 'episode',
				filePath: null,
				fileIndex: 0,
				magnetLink: 'magnet:?xt=urn:btih:episode123',
				status: 'pending',
			},
		});
		vi.mocked(torrent.getDownloadStatus).mockReturnValue({
			progress: 0,
			downloadSpeed: 0,
			uploadSpeed: 0,
			peers: 0,
			status: 'initializing',
		});

		const response = await HEAD({ params: { id: 'episode-1' }, locals: {} as App.Locals } as never);

		expect(response.status).toBe(202);
		expect(vi.mocked(torrent.startDownload)).toHaveBeenCalledWith('episode-1', 'magnet:?xt=urn:btih:episode123');
	});
});
