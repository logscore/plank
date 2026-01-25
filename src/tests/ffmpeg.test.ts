import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransmuxStream, isSupportedFormat, needsTransmux, probeFile, transmuxFile } from '$lib/server/ffmpeg';

// Mock ffmpeg-installer
vi.mock('@ffmpeg-installer/ffmpeg', () => ({
	default: { path: '/mock/ffmpeg' },
}));

// Mock fluent-ffmpeg
const { mockFfmpegConstructor, mockFfmpegCommand } = vi.hoisted(() => {
	const mockCommand = {
		inputFormat: vi.fn().mockReturnThis(),
		outputFormat: vi.fn().mockReturnThis(),
		outputOptions: vi.fn().mockReturnThis(),
		setStartTime: vi.fn().mockReturnThis(),
		output: vi.fn().mockReturnThis(),
		on: vi.fn().mockReturnThis(),
		pipe: vi.fn().mockReturnThis(),
		run: vi.fn(),
	};

	const mockConstructor = vi.fn(() => mockCommand);
	(mockConstructor as any).setFfmpegPath = vi.fn();
	(mockConstructor as any).ffprobe = vi.fn();

	return {
		mockFfmpegConstructor: mockConstructor,
		mockFfmpegCommand: mockCommand,
	};
});

vi.mock('fluent-ffmpeg', () => ({
	default: mockFfmpegConstructor,
}));

describe('FFmpeg Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset event handlers
		mockFfmpegCommand.on.mockImplementation((event, callback) => {
			if (event === 'end') {
				setTimeout(callback, 0);
			}
			return mockFfmpegCommand;
		});
	});

	describe('Format Helpers', () => {
		it('should identify transmuxable formats', () => {
			expect(needsTransmux('video.mkv')).toBe(true);
			expect(needsTransmux('video.avi')).toBe(true);
			expect(needsTransmux('video.mp4')).toBe(false);
		});

		it('should identify supported formats', () => {
			expect(isSupportedFormat('video.mp4')).toBe(true);
			expect(isSupportedFormat('video.mkv')).toBe(true);
			expect(isSupportedFormat('text.txt')).toBe(false);
		});
	});

	describe('createTransmuxStream', () => {
		it('should create a transmux stream', () => {
			const input = new PassThrough();
			const stream = createTransmuxStream({ inputStream: input });

			expect(mockFfmpegConstructor).toHaveBeenCalledWith(input);
			expect(mockFfmpegCommand.inputFormat).toHaveBeenCalledWith('matroska');
			expect(mockFfmpegCommand.outputFormat).toHaveBeenCalledWith('mp4');
			expect(stream).toBeInstanceOf(PassThrough);
		});

		it('should handle start time', () => {
			const input = new PassThrough();
			createTransmuxStream({ inputStream: input, start: 10 });

			expect(mockFfmpegCommand.setStartTime).toHaveBeenCalledWith(10);
		});

		it('should handle errors', () => {
			const input = new PassThrough();
			const onError = vi.fn();

			// Mock error handler
			mockFfmpegCommand.on.mockImplementation((event, callback) => {
				if (event === 'error') {
					setTimeout(() => {
						callback(new Error('FFmpeg error'), null, 'stderr output');
					}, 0);
				}
				return mockFfmpegCommand;
			});

			// We need to wait for the async error handling
			return new Promise<void>((resolve) => {
				const onError = vi.fn().mockImplementation(() => {
					resolve();
				});
				const stream = createTransmuxStream({ inputStream: input, onError });
				stream.on('error', () => {}); // Prevent uncaught exception
			});
		});
	});

	describe('transmuxFile', () => {
		it('should transmux file', async () => {
			mockFfmpegCommand.run.mockImplementation(() => {
				// Simulate success
			});

			await transmuxFile('input.mkv', 'output.mp4');

			expect(mockFfmpegConstructor).toHaveBeenCalledWith('input.mkv');
			expect(mockFfmpegCommand.output).toHaveBeenCalledWith('output.mp4');
			expect(mockFfmpegCommand.run).toHaveBeenCalled();
		});

		it('should handle transmux errors', async () => {
			mockFfmpegCommand.on.mockImplementation((event, callback) => {
				if (event === 'error') {
					setTimeout(() => callback(new Error('Transmux failed')), 0);
				}
				return mockFfmpegCommand;
			});

			await expect(transmuxFile('input.mkv', 'output.mp4')).rejects.toThrow('Transmux failed');
		});
	});

	describe('probeFile', () => {
		it('should probe file metadata', async () => {
			const mockMetadata = {
				format: { duration: 100 },
				streams: [
					{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
					{ codec_type: 'audio', codec_name: 'aac' },
				],
			};

			(mockFfmpegConstructor as any).ffprobe.mockImplementation(
				(_path: string, callback: (err: Error | null, data?: any) => void) => {
					callback(null, mockMetadata);
				}
			);

			const result = await probeFile('movie.mp4');

			expect(result).toEqual({
				videoCodec: 'h264',
				audioCodec: 'aac',
				duration: 100,
				width: 1920,
				height: 1080,
			});
		});

		it('should handle probe errors', async () => {
			(mockFfmpegConstructor as any).ffprobe.mockImplementation(
				(_path: string, callback: (err: Error | null, data?: any) => void) => {
					callback(new Error('Probe failed'));
				}
			);

			await expect(probeFile('movie.mp4')).rejects.toThrow('Probe failed');
		});
	});
});
