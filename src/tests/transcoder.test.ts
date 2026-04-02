import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaDb } from '../lib/server/db';
import { finalizeMediaToLibrary, transcodeLibrary } from '../lib/server/transcoder';

vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('../lib/server/db', () => ({
	mediaDb: {
		getAll: vi.fn(),
		getById: vi.fn(),
		getEpisodesByParentId: vi.fn(),
		updateFilePath: vi.fn(),
		updateFileInfo: vi.fn(),
	},
}));

vi.mock('../lib/server/ffmpeg', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/server/ffmpeg')>();
	return {
		...actual,
		normalizeFileForPlayback: vi.fn(),
		probeFile: vi.fn(),
		requiresBrowserSafePlayback: vi.fn(),
	};
});

import { normalizeFileForPlayback, probeFile, requiresBrowserSafePlayback } from '../lib/server/ffmpeg';

describe('library transcoder', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(probeFile).mockResolvedValue({
			videoCodec: 'h264',
			audioCodec: 'aac',
			duration: 100,
			width: 1920,
			height: 1080,
			audioChannels: 2,
			hasDataStreams: false,
		} as never);
		vi.mocked(requiresBrowserSafePlayback).mockResolvedValue(false);
		vi.mocked(fs.stat).mockResolvedValue({ size: 1000 } as never);
		vi.mocked(fs.unlink).mockResolvedValue(undefined);
		vi.mocked(fs.rename).mockResolvedValue(undefined);
		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.copyFile).mockResolvedValue(undefined);
	});

	it('normalizes non-mp4 movies and episodes into mp4 files', async () => {
		const movie = { id: 'movie-1', type: 'movie', filePath: '/lib/movie.mkv' };
		const episode = { id: 'episode-1', type: 'episode', filePath: '/lib/show/s01e01.mkv', fileIndex: 0 };
		vi.mocked(mediaDb.getAll).mockReturnValue([movie, { id: 'show-1', type: 'show', filePath: null }] as never);
		vi.mocked(mediaDb.getEpisodesByParentId).mockReturnValue([episode] as never);
		vi.mocked(mediaDb.getById).mockImplementation(((id: string) => {
			if (id === movie.id) {
				return movie;
			}
			if (id === episode.id) {
				return episode;
			}
			return undefined;
		}) as never);

		await transcodeLibrary();

		expect(vi.mocked(normalizeFileForPlayback)).toHaveBeenCalledTimes(2);
		expect(vi.mocked(mediaDb.updateFilePath)).toHaveBeenCalledWith('movie-1', '/lib/movie.mp4', 1000);
		expect(vi.mocked(mediaDb.updateFileInfo)).toHaveBeenCalledWith('episode-1', {
			fileIndex: 0,
			filePath: '/lib/show/s01e01.mp4',
			fileSize: 1000,
		});
	});

	it('fails finalization when output is not direct-playback safe', async () => {
		vi.mocked(requiresBrowserSafePlayback).mockResolvedValue(true);

		await expect(finalizeMediaToLibrary('/temp/pilot.mkv', '/library/pilot.mkv')).rejects.toThrow(
			'Finalized file is not browser-safe'
		);
		expect(vi.mocked(fs.rename)).not.toHaveBeenCalled();
	});
});
