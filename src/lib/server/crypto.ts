import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT = 'plank-settings-encryption';
const PBKDF2_ITERATIONS = 100_000;
const ENCRYPTED_PREFIX = 'enc:';

function deriveKey(): Buffer {
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error('BETTER_AUTH_SECRET is not set — cannot encrypt/decrypt settings');
	}
	return pbkdf2Sync(secret, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a prefixed string: "enc:<iv>:<authTag>:<ciphertext>" (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
	if (!plaintext) {
		return plaintext;
	}

	const key = deriveKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a string that was encrypted with `encrypt()`.
 * If the value is not encrypted (no prefix), returns it as-is for migration compatibility.
 */
export function decrypt(value: string): string {
	if (!value) {
		return value;
	}

	// Not encrypted — return plaintext as-is (handles migration from unencrypted DB)
	if (!value.startsWith(ENCRYPTED_PREFIX)) {
		return value;
	}

	const payload = value.slice(ENCRYPTED_PREFIX.length);
	const [ivHex, authTagHex, ciphertextHex] = payload.split(':');

	if (!(ivHex && authTagHex && ciphertextHex)) {
		throw new Error('Malformed encrypted value');
	}

	const key = deriveKey();
	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');
	const ciphertext = Buffer.from(ciphertextHex, 'hex');

	const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString('utf8');
}

/** Check whether a value is already encrypted */
export function isEncrypted(value: string): boolean {
	return value.startsWith(ENCRYPTED_PREFIX);
}
