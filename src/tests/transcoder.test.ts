import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaDb } from '../lib/server/db';
import { transcodeLibrary } from '../lib/server/transcoder';

vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('../lib/server/db', () => ({
	mediaDb: {
		getAll: vi.fn(),
		getEpisodesByParentId: vi.fn(),
		updateFilePath: vi.fn(),
		updateFileInfo: vi.fn(),
	},
}));

vi.mock('../lib/server/ffmpeg', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/server/ffmpeg')>();
	return {
		...actual,
		transmuxFile: vi.fn(),
		probeFile: vi.fn(),
	};
});

import { probeFile, transmuxFile } from '../lib/server/ffmpeg';

describe('library transcoder', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(probeFile).mockResolvedValue({ videoCodec: 'h264', audioCodec: 'aac', duration: 100 } as never);
		vi.mocked(fs.stat).mockResolvedValue({ size: 1000 } as never);
		vi.mocked(fs.unlink).mockResolvedValue(undefined);
	});

	it('transcodes non-mp4 movies and episodes', async () => {
		vi.mocked(mediaDb.getAll).mockReturnValue([
			{ id: 'movie-1', type: 'movie', filePath: '/lib/movie.mkv' },
			{ id: 'show-1', type: 'show', filePath: null },
		] as never);
		vi.mocked(mediaDb.getEpisodesByParentId).mockReturnValue([
			{ id: 'episode-1', type: 'episode', filePath: '/lib/show/s01e01.mkv', fileIndex: 0 },
		] as never);

		await transcodeLibrary();

		expect(vi.mocked(transmuxFile)).toHaveBeenCalledTimes(2);
		expect(vi.mocked(mediaDb.updateFilePath)).toHaveBeenCalledWith('movie-1', '/lib/movie.mp4', 1000);
		expect(vi.mocked(mediaDb.updateFileInfo)).toHaveBeenCalledWith('episode-1', {
			fileIndex: 0,
			filePath: '/lib/show/s01e01.mp4',
			fileSize: 1000,
		});
	});
});
