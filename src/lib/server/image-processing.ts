import { Jimp } from 'jimp';
import { imageStorage } from './storage';

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

const OUTPUT_SIZE = 512;
const OUTPUT_QUALITY = 85;

const MAGIC_BYTES: Record<string, number[]> = {
	'image/jpeg': [0xff, 0xd8, 0xff],
	'image/png': [0x89, 0x50, 0x4e, 0x47],
	'image/webp': [0x52, 0x49, 0x46, 0x46],
	'image/gif': [0x47, 0x49, 0x46, 0x38],
};

export function detectMimeType(buffer: Buffer): string | null {
	for (const [mimeType, bytes] of Object.entries(MAGIC_BYTES)) {
		if (bytes.every((byte, i) => buffer[i] === byte)) {
			if (mimeType === 'image/webp') {
				if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
					return mimeType;
				}
				continue;
			}
			return mimeType;
		}
	}
	return null;
}

export function validateImage(buffer: Buffer, declaredType: string | null): { valid: boolean; error?: string } {
	if (buffer.length > MAX_FILE_SIZE) {
		return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` };
	}

	const detectedType = detectMimeType(buffer);
	if (!detectedType) {
		return { valid: false, error: 'Invalid image format. Allowed: JPEG, PNG, WebP, GIF' };
	}

	if (declaredType && !ALLOWED_TYPES.includes(declaredType as (typeof ALLOWED_TYPES)[number])) {
		return { valid: false, error: 'Invalid image type' };
	}

	return { valid: true };
}

export async function processAndSave(buffer: Buffer, category: 'avatars' | 'logos', id: string): Promise<string> {
	const image = await Jimp.read(buffer);
	image.cover({ w: OUTPUT_SIZE, h: OUTPUT_SIZE });

	const processed = await image.getBuffer('image/jpeg', { quality: OUTPUT_QUALITY });

	return imageStorage.save(category, id, 'image.jpg', Buffer.from(processed));
}
