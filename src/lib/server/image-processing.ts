import { Jimp, JimpMime } from 'jimp';
import { imageStorage } from './storage';

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif'] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 85;

const MAGIC_BYTES: Record<string, number[]> = {
	'image/jpeg': [0xff, 0xd8, 0xff],
	'image/png': [0x89, 0x50, 0x4e, 0x47],
	'image/gif': [0x47, 0x49, 0x46, 0x38],
};

export function detectMimeType(buffer: Buffer): string | null {
	for (const [mimeType, bytes] of Object.entries(MAGIC_BYTES)) {
		if (bytes.every((byte, i) => buffer[i] === byte)) {
			return mimeType;
		}
	}
	return null;
}

export function validateImage(buffer: Buffer, declaredType: string | null): { valid: boolean; error?: string } {
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
			error: 'Invalid image format. Allowed: JPEG, PNG, GIF',
		};
	}

	if (declaredType && !ALLOWED_TYPES.includes(declaredType as (typeof ALLOWED_TYPES)[number])) {
		return { valid: false, error: 'Invalid image type' };
	}

	return { valid: true };
}

export async function processAndSave(buffer: Buffer, category: 'avatars' | 'logos', id: string): Promise<string> {
	const image = await Jimp.read(buffer);
	image.cover({ w: OUTPUT_SIZE, h: OUTPUT_SIZE });
	const processed = await image.getBuffer(JimpMime.jpeg, { quality: OUTPUT_QUALITY });

	return imageStorage.save(category, id, 'image.jpg', processed);
}

const IMAGES_PREFIX = /^\/images\//;

export async function replaceStoredImage(
	oldImagePath: string | null | undefined,
	buffer: Buffer,
	mimeType: string,
	category: 'avatars' | 'logos',
	id: string
): Promise<{ imagePath: string } | { error: string }> {
	const validation = validateImage(buffer, mimeType);
	if (!validation.valid) {
		return { error: validation.error ?? 'Invalid image' };
	}

	let relativePath: string;
	try {
		relativePath = await processAndSave(buffer, category, id);
	} catch {
		return { error: 'Failed to process image. Allowed: JPEG, PNG, GIF' };
	}

	if (oldImagePath) {
		try {
			await imageStorage.delete(oldImagePath.replace(IMAGES_PREFIX, ''));
		} catch {
			// File may not exist, ignore
		}
	}

	return { imagePath: `/images/${relativePath}` };
}
