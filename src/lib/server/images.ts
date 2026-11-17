import fs from "node:fs/promises";
import path from "node:path";
import { Jimp, JimpMime } from "jimp";
import { nanoid } from "nanoid";
import { PATHS } from "./paths";

type AllowedType = (typeof ALLOWED_TYPES)[number];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 mb

const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 90;

const IMAGES_PREFIX = /^\/api\/images\//;
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g;
const PATH_SEPARATOR = /[\\/]/;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/;

export function sanitizeFilename(value: string): string {
	const withoutControlCharacters = Array.from(value)
		.filter((character) => character.charCodeAt(0) >= 32)
		.join("");
	return (
		withoutControlCharacters
			.replace(INVALID_FILENAME_CHARACTERS, "_")
			.trim()
			.replace(TRAILING_DOTS_AND_SPACES, "") || "_"
	);
}

async function ensureDir(dir: string): Promise<void> {
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
export async function saveImage(
	category: string, // e.g., 'library'
	id: string, // e.g., 'abc-123'
	filename: string, // e.g., 'poster.jpg'
	data: Buffer | ArrayBuffer
): Promise<string> {
	const buffer = data instanceof Buffer ? data : Buffer.from(new Uint8Array(data));

	const validation = await validateImage(buffer);
	if (!validation.valid) {
		throw new Error(validation.error ?? "Invalid image");
	}

	const safeCategory = sanitizeFilename(category);
	const safeId = sanitizeFilename(id);
	const safeFilename = sanitizeFilename(filename);
	const relativeDir = path.join(safeCategory, safeId);
	const absDir = path.join(PATHS.data, relativeDir);

	await ensureDir(absDir);

	const filePath = path.join(absDir, safeFilename);
	const image = await Jimp.read(buffer);
	if (category === "logos" || category === "avatars") {
		image.cover({ w: OUTPUT_SIZE, h: OUTPUT_SIZE });
	}
	const processed = await image.getBuffer(JimpMime.jpeg, { quality: OUTPUT_QUALITY });

	await fs.writeFile(filePath, processed);

	// Return a path suitable for the serving route.
	// Assuming we serve from /images/[...path], and we store inside data/
	// We can return the relative path inside 'data'
	return path.join(relativeDir, safeFilename);
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
	const safePath = relativePath.split(PATH_SEPARATOR).map(sanitizeFilename).join(path.sep);
	const filePath = path.join(PATHS.data, safePath);
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
	category: "avatars" | "logos",
	id: string
): Promise<{ imagePath: string } | { error: string }> {
	const validation = await validateImage(buffer);
	if (!validation.valid) {
		return { error: validation.error ?? "Invalid image" };
	}

	let relativePath: string;
	try {
		relativePath = await saveImage(category, id, `${nanoid(10)}.jpg`, buffer);
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

	return { imagePath: `/api/images/${relativePath}` };
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
			const storedPath = await saveFromUrl(category, id, "poster.jpg", metadata.posterUrl);
			result.posterUrl = `/api/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save poster for ${id}:`, e);
		}
	}

	if (metadata.backdropUrl) {
		try {
			const storedPath = await saveFromUrl(category, id, "backdrop.jpg", metadata.backdropUrl);
			result.backdropUrl = `/api/images/${storedPath}`;
		} catch (e) {
			console.error(`Failed to save backdrop for ${id}:`, e);
		}
	}

	return result;
}

// HELPERS
async function validateImage(buffer: Buffer): Promise<{ valid: boolean; error?: string }> {
	if (buffer.length > MAX_FILE_SIZE) {
		return {
			valid: false,
			error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
		};
	}

	// Read image buffer and check mimetype is valid
	let image: Awaited<ReturnType<typeof Jimp.fromBuffer>>;
	try {
		image = await Jimp.fromBuffer(buffer);
	} catch {
		return {
			valid: false,
			error: "Invalid image format. Allowed: JPEG, PNG, GIF",
		};
	}

	if (!(image.mime && ALLOWED_TYPES.includes(image.mime as AllowedType))) {
		return { valid: false, error: "Invalid image type" };
	}

	return { valid: true };
}
