import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageStorageService } from '$lib/server/storage';

// Mock config and fs
vi.mock('$lib/config', () => ({
	config: {
		paths: {
			data: '/mock/data',
		},
	},
}));

vi.mock('node:fs/promises', () => {
	const mockFiles = new Map<string, Buffer>();
	return {
		default: {
			access: vi.fn(),
			mkdir: vi.fn(),
			writeFile: vi.fn(),
			unlink: vi.fn(),
			stat: vi.fn(),
			readFile: vi.fn(),
		},
	};
});

describe('ImageStorageService', () => {
	let service: ImageStorageService;

	beforeEach(() => {
		service = new ImageStorageService();
		vi.clearAllMocks();
	});

	it('should save a file from buffer', async () => {
		const buffer = Buffer.from('test-image');
		(fs.access as any).mockRejectedValueOnce(new Error('ENOENT')); // Directory doesn't exist initially
		(fs.mkdir as any).mockResolvedValue(undefined);
		(fs.writeFile as any).mockResolvedValue(undefined);

		const savedPath = await service.save('library', '123', 'poster.jpg', buffer);

		// Verify directory creation
		expect(fs.mkdir).toHaveBeenCalledWith(path.normalize('/mock/data/library/123'), {
			recursive: true,
		});

		// Verify file write
		expect(fs.writeFile).toHaveBeenCalledWith(
			path.normalize('/mock/data/library/123/poster.jpg'),
			buffer
		);

		// Verify return path
		expect(savedPath).toBe('library/123/poster.jpg');
	});

	it('should save a file from URL', async () => {
		const mockUrl = 'http://example.com/image.jpg';
		const mockBuffer = Buffer.from('downloaded-image');

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: async () => mockBuffer,
		});

		(fs.access as any).mockResolvedValue(undefined); // Directory exists
		(fs.writeFile as any).mockResolvedValue(undefined);

		const savedPath = await service.saveFromUrl('library', '456', 'backdrop.jpg', mockUrl);

		expect(global.fetch).toHaveBeenCalledWith(mockUrl);
		expect(fs.writeFile).toHaveBeenCalled();
		expect(savedPath).toBe('library/456/backdrop.jpg');
	});

	it('should create directory if it does not exist', async () => {
		const buffer = Buffer.from('test');
		(fs.access as any).mockRejectedValue(new Error('No dir'));

		await service.save('a', 'b', 'c.jpg', buffer);

		expect(fs.mkdir).toHaveBeenCalled();
	});

	it('should handle fetch errors in saveFromUrl', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			statusText: 'Not Found',
		});

		await expect(service.saveFromUrl('a', 'b', 'c', 'http://bad.url')).rejects.toThrow(
			'Failed to fetch image from http://bad.url: Not Found'
		);
	});

	it('should delete a file', async () => {
		(fs.unlink as any).mockResolvedValue(undefined);
		await service.delete('library/123/poster.jpg');
		expect(fs.unlink).toHaveBeenCalledWith(path.normalize('/mock/data/library/123/poster.jpg'));
	});

	it('should ignore delete errors if file missing', async () => {
		(fs.unlink as any).mockRejectedValue(new Error('ENOENT'));
		await expect(service.delete('library/123/missing.jpg')).resolves.not.toThrow();
	});
});
