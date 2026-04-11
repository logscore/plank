import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
	LocalStorageConfig,
	StorageAdapter,
	StorageListItem,
	StorageMetadata,
	StorageRange,
	StorageWriteOptions,
} from './types';

const LEADING_SLASHES_REGEX = /^\/+/;

export class LocalStorageAdapter implements StorageAdapter {
	private readonly basePath: string;

	constructor(config: LocalStorageConfig) {
		this.basePath = path.resolve(config.basePath);
	}

	resolvePath(key: string): string {
		const safeKey = this.normalizeKey(key);
		return path.join(this.basePath, ...safeKey.split('/'));
	}

	async write(key: string, data: Buffer | Uint8Array | string, _options?: StorageWriteOptions): Promise<void> {
		const targetPath = this.resolvePath(key);
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.writeFile(targetPath, data);
	}

	async writeStream(key: string, stream: NodeJS.ReadableStream, _options?: StorageWriteOptions): Promise<void> {
		const targetPath = this.resolvePath(key);
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await pipeline(stream, createWriteStream(targetPath));
	}

	async writeFromLocalPath(key: string, localPath: string, _options?: StorageWriteOptions): Promise<void> {
		const targetPath = this.resolvePath(key);
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.copyFile(localPath, targetPath);
	}

	async read(key: string): Promise<Buffer> {
		return fs.readFile(this.resolvePath(key));
	}

	async readStream(key: string, range?: StorageRange): Promise<import('node:stream').Readable> {
		const targetPath = this.resolvePath(key);
		return createReadStream(targetPath, range);
	}

	async exists(key: string): Promise<boolean> {
		try {
			await fs.access(this.resolvePath(key));
			return true;
		} catch {
			return false;
		}
	}

	async metadata(key: string): Promise<StorageMetadata | null> {
		try {
			const safeKey = this.normalizeKey(key);
			const stats = await fs.stat(this.resolvePath(safeKey));
			if (!stats.isFile()) {
				return null;
			}
			return {
				key: safeKey,
				size: stats.size,
				lastModified: stats.mtime,
			};
		} catch {
			return null;
		}
	}

	async delete(key: string): Promise<void> {
		await fs.unlink(this.resolvePath(key)).catch(() => undefined);
	}

	async deletePrefix(prefix: string): Promise<void> {
		const safePrefix = this.normalizeKey(prefix);
		if (!safePrefix) {
			return;
		}
		await fs.rm(this.resolvePath(safePrefix), { recursive: true, force: true });
	}

	async list(prefix: string): Promise<StorageListItem[]> {
		const safePrefix = this.normalizeKey(prefix);
		const rootPath = this.resolvePath(safePrefix);
		const entries = await this.walk(rootPath, safePrefix).catch(() => []);
		return entries.sort((left, right) => left.key.localeCompare(right.key));
	}

	async testConnection(): Promise<void> {
		const probeKey = `.storage-probe-${crypto.randomUUID()}`;
		await this.write(probeKey, 'ok');
		await this.delete(probeKey);
	}

	private normalizeKey(key: string): string {
		const normalized = path.posix.normalize(key.replaceAll('\\', '/')).replace(LEADING_SLASHES_REGEX, '');
		if (!normalized || normalized === '.') {
			return '';
		}
		if (normalized.split('/').some((segment) => segment === '..')) {
			throw new Error(`Invalid storage key: ${key}`);
		}
		return normalized;
	}

	private async walk(currentPath: string, currentKey: string): Promise<StorageListItem[]> {
		const stats = await fs.stat(currentPath);
		if (stats.isFile()) {
			return [
				{
					key: currentKey,
					size: stats.size,
					lastModified: stats.mtime,
				},
			];
		}

		const items = await fs.readdir(currentPath, { withFileTypes: true });
		const results: StorageListItem[] = [];
		for (const item of items) {
			const nextPath = path.join(currentPath, item.name);
			const nextKey = currentKey ? `${currentKey}/${item.name}` : item.name;
			if (item.isDirectory()) {
				results.push(...(await this.walk(nextPath, nextKey)));
				continue;
			}
			if (!item.isFile()) {
				continue;
			}
			const statsValue = await fs.stat(nextPath);
			results.push({
				key: nextKey,
				size: statsValue.size,
				lastModified: statsValue.mtime,
			});
		}
		return results;
	}
}
