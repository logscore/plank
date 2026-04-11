import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '$lib/config';
import { getStorageAdapter } from '$lib/server/storage/factory';
import { LocalStorageAdapter } from '$lib/server/storage/local';
import type { StorageMetadata, StorageRange } from '$lib/server/storage/types';

const IMAGE_PATH_PREFIX = /^\/images\//;
const WINDOWS_SEPARATOR_REGEX = /\\/g;
const LEADING_SLASHES_REGEX = /^\/+/;
const ORG_STORAGE_PREFIX = 'orgs';

export function normalizeStorageKey(key: string): string {
	const normalized = path.posix
		.normalize(key.replace(WINDOWS_SEPARATOR_REGEX, '/'))
		.replace(LEADING_SLASHES_REGEX, '');
	if (normalized === '.') {
		return '';
	}
	return normalized;
}

export function buildStorageKey(...parts: string[]): string {
	return normalizeStorageKey(parts.filter(Boolean).join('/'));
}

export function buildOrganizationStorageKey(organizationId: string | null | undefined, ...parts: string[]): string {
	return organizationId ? buildStorageKey(ORG_STORAGE_PREFIX, organizationId, ...parts) : buildStorageKey(...parts);
}

export function getOrganizationIdFromStorageKey(key: string): string | null {
	if (path.isAbsolute(key)) {
		return null;
	}
	const parts = normalizeStorageKey(key).split('/');
	return parts[0] === ORG_STORAGE_PREFIX && parts[1] ? parts[1] : null;
}

export function stripImagePathPrefix(imagePath: string): string {
	return imagePath.replace(IMAGE_PATH_PREFIX, '');
}

export function isAbsoluteStoragePath(filePath: string): boolean {
	return path.isAbsolute(filePath);
}

export function getStoragePathDirectory(filePath: string): string {
	if (isAbsoluteStoragePath(filePath)) {
		return path.dirname(filePath);
	}
	return path.posix.dirname(normalizeStorageKey(filePath));
}

function getRelativeKeyFromDataPath(filePath: string): string | null {
	const basePath = path.resolve(config.paths.data);
	const resolvedPath = path.resolve(filePath);
	if (!(resolvedPath === basePath || resolvedPath.startsWith(`${basePath}${path.sep}`))) {
		return null;
	}
	return normalizeStorageKey(path.relative(basePath, resolvedPath));
}

export function getCanonicalStoragePath(filePath: string): string {
	if (isAbsoluteStoragePath(filePath)) {
		return getRelativeKeyFromDataPath(filePath) ?? filePath;
	}
	return normalizeStorageKey(filePath);
}

export async function resolveLocalStoragePath(
	filePath: string | null | undefined,
	organizationId?: string | null
): Promise<string | null> {
	if (!filePath) {
		return null;
	}
	if (isAbsoluteStoragePath(filePath)) {
		return existsSync(filePath) ? filePath : null;
	}
	const adapter = await getStorageAdapter(organizationId);
	if (!(adapter instanceof LocalStorageAdapter)) {
		return null;
	}
	const resolvedPath = adapter.resolvePath(normalizeStorageKey(filePath));
	return existsSync(resolvedPath) ? resolvedPath : null;
}

export async function storedFileExists(
	filePath: string | null | undefined,
	organizationId?: string | null
): Promise<boolean> {
	if (!filePath) {
		return false;
	}
	if (isAbsoluteStoragePath(filePath)) {
		return existsSync(filePath);
	}
	const adapter = await getStorageAdapter(organizationId);
	return adapter.exists(normalizeStorageKey(filePath));
}

export async function getStoredFileMetadata(
	filePath: string | null | undefined,
	organizationId?: string | null
): Promise<StorageMetadata | null> {
	if (!filePath) {
		return null;
	}
	if (isAbsoluteStoragePath(filePath)) {
		try {
			const stats = await fs.stat(filePath);
			if (!stats.isFile()) {
				return null;
			}
			return {
				key: getCanonicalStoragePath(filePath),
				size: stats.size,
				lastModified: stats.mtime,
			};
		} catch {
			return null;
		}
	}
	const adapter = await getStorageAdapter(organizationId);
	return adapter.metadata(normalizeStorageKey(filePath));
}

export async function readStoredFile(filePath: string, organizationId?: string | null): Promise<Buffer> {
	if (isAbsoluteStoragePath(filePath)) {
		return fs.readFile(filePath);
	}
	const adapter = await getStorageAdapter(organizationId);
	return adapter.read(normalizeStorageKey(filePath));
}

export async function readStoredFileStream(
	filePath: string,
	organizationId?: string | null,
	range?: StorageRange
): Promise<import('node:stream').Readable> {
	if (isAbsoluteStoragePath(filePath)) {
		return createReadStream(filePath, range);
	}
	const adapter = await getStorageAdapter(organizationId);
	return adapter.readStream(normalizeStorageKey(filePath), range);
}

export async function deleteStoredFile(
	filePath: string | null | undefined,
	organizationId?: string | null
): Promise<void> {
	if (!filePath) {
		return;
	}
	if (isAbsoluteStoragePath(filePath)) {
		await fs.rm(filePath, { force: true });
		return;
	}
	const adapter = await getStorageAdapter(organizationId);
	await adapter.delete(normalizeStorageKey(filePath));
}

export async function deleteStoredPrefix(
	prefix: string | null | undefined,
	organizationId?: string | null
): Promise<void> {
	if (!prefix) {
		return;
	}
	if (isAbsoluteStoragePath(prefix)) {
		await fs.rm(prefix, { recursive: true, force: true });
		return;
	}
	const adapter = await getStorageAdapter(organizationId);
	await adapter.deletePrefix(normalizeStorageKey(prefix));
}

export function getStoredFileName(filePath: string): string {
	return isAbsoluteStoragePath(filePath)
		? path.basename(filePath)
		: path.posix.basename(normalizeStorageKey(filePath));
}

export class ImageStorageService {
	async save(
		category: string,
		id: string,
		filename: string,
		data: Buffer | ArrayBuffer,
		organizationId?: string | null
	): Promise<string> {
		const buffer = data instanceof Buffer ? data : Buffer.from(new Uint8Array(data));
		const storageKey = buildOrganizationStorageKey(organizationId, category, id, filename);
		const adapter = await getStorageAdapter(organizationId);
		await adapter.write(storageKey, buffer);
		return storageKey;
	}

	async saveFromUrl(
		category: string,
		id: string,
		filename: string,
		url: string,
		organizationId?: string | null
	): Promise<string> {
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`Failed to fetch image from ${url}: ${res.statusText}`);
		}
		const arrayBuffer = await res.arrayBuffer();
		return this.save(category, id, filename, arrayBuffer, organizationId);
	}

	async delete(relativePath: string, organizationId?: string | null): Promise<void> {
		try {
			await deleteStoredFile(relativePath, organizationId);
		} catch (e) {
			console.warn(`Failed to delete file ${relativePath}:`, e);
		}
	}
}

export const imageStorage = new ImageStorageService();
