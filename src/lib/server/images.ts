import fs from "node:fs/promises";
import path from "node:path";
import { Jimp, JimpMime } from "jimp";
import { config } from "$lib/config";

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 mb

const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 90;

const MAGIC_BYTES: Record<string, number[]> = {
	"image/jpeg": [0xff, 0xd8, 0xff],
	"image/png": [0x89, 0x50, 0x4e, 0x47],
	"image/gif": [0x47, 0x49, 0x46, 0x38],
};

const IMAGES_PREFIX = /^\/images\//;

async function ensureDir(dir: string): Promise<void> {
	try {
		await fs.access(dir);
	} catch {
		await fs.mkdir(dir, { recursive: true });
	}
}

/**
 * Save a buffer to a file
 * @returns The relative path to the saved file (e.g., 'images/abc-123/poster.jpg')
 */
export async function saveImage(
	category: string, // e.g., 'library'
	id: string, // e.g., 'abc-123'
	filename: string, // e.g., 'poster.jpg'
	data: Buffer | ArrayBuffer
): Promise<string> {
	const buffer = data instanceof Buffer ? data : Buffer.from(new Uint8Array(data));

	const validation = validateImage(buffer, null);
	if (!validation.valid) {
		throw new Error(validation.error ?? "Invalid image");
	}

	const relativeDir = path.join(category, id);
	const absDir = path.join(config.paths.data, `/images/${relativeDir}`);

	await ensureDir(absDir);

	const filePath = path.join(absDir, filename);
	const image = await Jimp.read(buffer);
	if (category === "logos" || category === "avatars") {
		image.cover({ w: OUTPUT_SIZE, h: OUTPUT_SIZE });
	}
	const processed = await image.getBuffer(JimpMime.jpeg, { quality: OUTPUT_QUALITY });

	console.debug(filePath);

	await fs.writeFile(filePath, processed);

	// Return a path suitable for the serving route.
	// Assuming we serve from /images/[...path], and we store inside data/
	// We can return the relative path inside 'data'
	return path.join(relativeDir, filename);
}

/**
 * Download file from URL and save it
 */
async function saveFromUrl(category: string, id: string, filename: string, url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch image from ${url}: ${res.statusText}`);
	}
	const arrayBuffer = await res.arrayBuffer();
	return saveImage(category, id, filename, arrayBuffer);
}

/**
 * Delete a file
 */
export async function deleteImage(relativePath: string): Promise<void> {
	const filePath = path.join(config.paths.data, `/images/${relativePath}`);
	try {
		await fs.unlink(filePath);
	} catch (e) {
		// Ignore if file doesn't exist
		console.warn(`Failed to delete file ${filePath}:`, e);
	}
}

/**
 * Replace a file
 */
export async function replaceImage(
	oldImagePath: string | null | undefined,
	buffer: Buffer,
	mimeType: string,
	category: "avatars" | "logos",
	id: string
): Promise<{ imagePath: string } | { error: string }> {
	const validation = validateImage(buffer, mimeType);
	if (!validation.valid) {
		return { error: validation.error ?? "Invalid image" };
	}

	let relativePath: string;
	try {
		relativePath = await saveImage(category, id, "image.jpg", buffer);
	} catch {
		return { error: "Failed to process image. Allowed: JPEG, PNG, GIF" };
	}

	if (oldImagePath && oldImagePath.replace(IMAGES_PREFIX, "") !== relativePath) {
		try {
			await deleteImage(oldImagePath.replace(IMAGES_PREFIX, ""));
		} catch {
			// File may not exist, ignore
		}
	}

	return { imagePath: `/images/${relativePath}` };
}

export async function savePosterBackdropImages(
	metadata: {
		posterUrl: string | null;
		backdropUrl: string | null;
	},
	category: string,
	id: string
): Promise<{ posterUrl: string | null; backdropUrl: string | null }> {
	const result = {
		posterUrl: metadata.posterUrl,
		backdropUrl: metadata.backdropUrl,
	};

	if (metadata.posterUrl) {
		try {
			// metadata.posterUrl already contains the full URL (e.g. from getMovieDetails mapping)
			// so we can use it directly.
			// Wait, the previous mapping code uses settings.tmdb.imageBaseUrl to construct metadata.posterUrl
			// So metadata.posterUrl IS a full URL.
			// imageStorage.saveFromUrl expects a URL.
			const storedPath = await saveFromUrl(category, id, "poster.jpg", metadata.posterUrl);
			result.posterUrl = `/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save poster for ${id}:`, e);
		}
	}

	if (metadata.backdropUrl) {
		try {
			const storedPath = await saveFromUrl(category, id, "backdrop.jpg", metadata.backdropUrl);
			result.backdropUrl = `/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save backdrop for ${id}:`, e);
		}
	}

	return result;
}

// HELPERS
function detectMimeType(buffer: Buffer): string | null {
	for (const [mimeType, bytes] of Object.entries(MAGIC_BYTES)) {
		if (bytes.every((byte, i) => buffer[i] === byte)) {
			return mimeType;
		}
	}
	return null;
}

function validateImage(buffer: Buffer, declaredType: string | null): { valid: boolean; error?: string } {
	if (buffer.length > MAX_FILE_SIZE) {
		return {
			valid: false,
			error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
		};
	}

	const detectedType = detectMimeType(buffer);
	if (!detectedType) {
		return {
			valid: false,
			error: "Invalid image format. Allowed: JPEG, PNG, GIF",
		};
	}

	if (declaredType && !ALLOWED_TYPES.includes(declaredType as (typeof ALLOWED_TYPES)[number])) {
		return { valid: false, error: "Invalid image type" };
	}

	return { valid: true };
}
