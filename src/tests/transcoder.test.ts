import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaDb } from '../lib/server/db';
import { transcodeLibrary } from '../lib/server/transcoder';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('../lib/server/db');
vi.mock('../lib/server/ffmpeg', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/server/ffmpeg')>();
	return {
		...actual,
		transmuxFile: vi.fn(), // Mock the actual ffmpeg call
		probeFile: vi.fn(), // Mock the integrity check probe
	};
});

// Import mocked functions to set their behavior
import { probeFile, transmuxFile } from '../lib/server/ffmpeg';

describe('Library Transcoder', () => {
	const mockMedia = [
		{ id: '1', type: 'movie', filePath: '/lib/movie.mkv', title: 'Movie 1' },
		{ id: '2', type: 'movie', filePath: '/lib/movie2.mp4', title: 'Movie 2' }, // Should be skipped
	];

	beforeEach(() => {
		vi.resetAllMocks();

		// Setup DB mock
		(mediaDb.getAll as any).mockReturnValue(mockMedia);

		(fs.stat as any).mockResolvedValue({ size: 1000 });
		(fs.rename as any).mockResolvedValue(undefined);
		(fs.unlink as any).mockResolvedValue(undefined);
		(existsSync as any).mockReturnValue(true);
	});

	it('should identify and transmux non-mp4 files', async () => {
		// Mock successful transmux
		(transmuxFile as any).mockResolvedValue(undefined);
		// Mock successful probe (valid file)
		(probeFile as any).mockResolvedValue({ videoCodec: 'h264', duration: 100 });
		// Mock fs.stat to return non-zero size
		(fs.stat as any).mockResolvedValue({ size: 1000 });

		await transcodeLibrary();

		// Should call transmuxFile for the MKV file
		expect(transmuxFile).toHaveBeenCalledWith('/lib/movie.mkv', '/lib/movie.transcoding.mp4');

		// Should NOT call for MP4 file
		expect(transmuxFile).not.toHaveBeenCalledWith('/lib/movie2.mp4', expect.anything());
	});

	it('should replace original file only if integrity check passes', async () => {
		(transmuxFile as any).mockResolvedValue(undefined);
		(probeFile as any).mockResolvedValue({ videoCodec: 'h264', duration: 100 }); // Valid
		(fs.stat as any).mockResolvedValue({ size: 1000 });

		await transcodeLibrary();

		// Should rename temp to final
		expect(fs.rename).toHaveBeenCalledWith('/lib/movie.transcoding.mp4', '/lib/movie.mp4');

		// Should update DB
		expect(mediaDb.updateFilePath).toHaveBeenCalledWith('1', '/lib/movie.mp4', 1000);

		// Should delete original
		expect(fs.unlink).toHaveBeenCalledWith('/lib/movie.mkv');
	});

	it('should safe-guard against corrupt output', async () => {
		(transmuxFile as any).mockResolvedValue(undefined);

		// Simulate CORRUPT output (no duration, no streams)
		(probeFile as any).mockResolvedValue({ videoCodec: null, audioCodec: null, duration: 0 });
		(fs.stat as any).mockResolvedValue({ size: 100 }); // File exists but is garbage

		await transcodeLibrary();

		// Should verify integrity
		expect(probeFile).toHaveBeenCalledWith('/lib/movie.transcoding.mp4');

		// Should NOT rename to final
		expect(fs.rename).not.toHaveBeenCalled();

		// Should NOT update DB
		expect(mediaDb.updateFilePath).not.toHaveBeenCalled();

		// Should NOT delete original
		expect(fs.unlink).not.toHaveBeenCalledWith('/lib/movie.mkv');

		// Should clean up temp file
		expect(fs.unlink).toHaveBeenCalledWith('/lib/movie.transcoding.mp4');
	});

	it('should safe-guard against 0-byte output', async () => {
		(transmuxFile as any).mockResolvedValue(undefined);
		(fs.stat as any).mockResolvedValue({ size: 0 }); // Empty file

		await transcodeLibrary();

		// Should NOT rename
		expect(fs.rename).not.toHaveBeenCalled();
		// Should clean up temp
		expect(fs.unlink).toHaveBeenCalledWith('/lib/movie.transcoding.mp4');
	});
});
