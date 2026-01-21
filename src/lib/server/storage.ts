import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '$lib/config';

export class ImageStorageService {
	/**
	 * Ensure the directory exists
	 */
	private async ensureDir(dir: string): Promise<void> {
		try {
			await fs.access(dir);
		} catch {
			await fs.mkdir(dir, { recursive: true });
		}
	}

	/**
	 * Save a buffer to a file
	 * @returns The relative path to the saved file (e.g., 'library/abc-123/poster.jpg')
	 */
	async save(
		category: string, // e.g., 'library'
		id: string, // e.g., 'abc-123'
		filename: string, // e.g., 'poster.jpg'
		data: Buffer | ArrayBuffer
	): Promise<string> {
		const relativeDir = path.join(category, id);
		const absDir = path.join(config.paths.data, relativeDir);

		await this.ensureDir(absDir);

		const filePath = path.join(absDir, filename);
		await fs.writeFile(filePath, Buffer.from(data as any)); // Convert ArrayBuffer to Buffer if needed

		// Return a path suitable for the serving route.
		// Assuming we serve from /images/[...path], and we store inside data/
		// We can return the relative path inside 'data'
		return path.join(relativeDir, filename);
	}

	/**
	 * Download file from URL and save it
	 */
	async saveFromUrl(category: string, id: string, filename: string, url: string): Promise<string> {
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`Failed to fetch image from ${url}: ${res.statusText}`);
		}
		const arrayBuffer = await res.arrayBuffer();
		return this.save(category, id, filename, arrayBuffer);
	}

	/**
	 * Delete a file
	 */
	async delete(relativePath: string): Promise<void> {
		const filePath = path.join(config.paths.data, relativePath);
		try {
			await fs.unlink(filePath);
		} catch (e) {
			// Ignore if file doesn't exist
			console.warn(`Failed to delete file ${filePath}:`, e);
		}
	}
}

export const imageStorage = new ImageStorageService();
