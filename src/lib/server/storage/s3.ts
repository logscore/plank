import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type {
	S3StorageConfig,
	StorageAdapter,
	StorageListItem,
	StorageMetadata,
	StorageRange,
	StorageWriteOptions,
} from './types';

const S3_DELETE_BATCH_SIZE = 1000;
const LEADING_SLASHES_REGEX = /^\/+/;

export class S3StorageAdapter implements StorageAdapter {
	private readonly bucket: string;
	private readonly client: S3Client;

	constructor(config: S3StorageConfig) {
		this.bucket = config.bucket;
		this.client = new S3Client({
			region: config.region,
			endpoint: config.endpoint,
			forcePathStyle: config.forcePathStyle,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
		});
	}

	async write(key: string, data: Buffer | Uint8Array | string, options?: StorageWriteOptions): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: this.normalizeKey(key),
				Body: typeof data === 'string' ? Buffer.from(data) : data,
				ContentLength: options?.contentLength,
				ContentType: options?.contentType,
			})
		);
	}

	async writeStream(key: string, stream: NodeJS.ReadableStream, options?: StorageWriteOptions): Promise<void> {
		await new Upload({
			client: this.client,
			params: {
				Bucket: this.bucket,
				Key: this.normalizeKey(key),
				Body: stream as Readable,
				ContentLength: options?.contentLength,
				ContentType: options?.contentType,
			},
		}).done();
	}

	async writeFromLocalPath(key: string, localPath: string, options?: StorageWriteOptions): Promise<void> {
		await this.writeStream(this.normalizeKey(key), createReadStream(localPath), options);
	}

	async read(key: string): Promise<Buffer> {
		const response = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: this.normalizeKey(key),
			})
		);
		return this.readBody(response.Body);
	}

	async readStream(key: string, range?: StorageRange): Promise<Readable> {
		const response = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: this.normalizeKey(key),
				Range: this.toRangeHeader(range),
			})
		);
		if (!(response.Body instanceof Readable)) {
			throw new Error(`Failed to create readable stream for ${key}`);
		}
		return response.Body;
	}

	async exists(key: string): Promise<boolean> {
		try {
			await this.client.send(
				new HeadObjectCommand({
					Bucket: this.bucket,
					Key: this.normalizeKey(key),
				})
			);
			return true;
		} catch (error) {
			if (this.isMissingObjectError(error)) {
				return false;
			}
			throw error;
		}
	}

	async metadata(key: string): Promise<StorageMetadata | null> {
		try {
			const safeKey = this.normalizeKey(key);
			const response = await this.client.send(
				new HeadObjectCommand({
					Bucket: this.bucket,
					Key: safeKey,
				})
			);
			return {
				key: safeKey,
				size: response.ContentLength ?? 0,
				lastModified: response.LastModified,
				contentType: response.ContentType,
				etag: response.ETag,
			};
		} catch (error) {
			if (this.isMissingObjectError(error)) {
				return null;
			}
			throw error;
		}
	}

	async delete(key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectsCommand({
				Bucket: this.bucket,
				Delete: {
					Objects: [{ Key: this.normalizeKey(key) }],
					Quiet: true,
				},
			})
		);
	}

	async deletePrefix(prefix: string): Promise<void> {
		const keys = (await this.list(prefix)).map((item) => ({ Key: item.key }));
		for (let index = 0; index < keys.length; index += S3_DELETE_BATCH_SIZE) {
			const batch = keys.slice(index, index + S3_DELETE_BATCH_SIZE);
			if (batch.length === 0) {
				continue;
			}
			await this.client.send(
				new DeleteObjectsCommand({
					Bucket: this.bucket,
					Delete: {
						Objects: batch,
						Quiet: true,
					},
				})
			);
		}
	}

	async list(prefix: string): Promise<StorageListItem[]> {
		const safePrefix = this.normalizeKey(prefix);
		const results: StorageListItem[] = [];
		let continuationToken: string | undefined;
		do {
			const response = await this.client.send(
				new ListObjectsV2Command({
					Bucket: this.bucket,
					Prefix: safePrefix || undefined,
					ContinuationToken: continuationToken,
				})
			);
			for (const item of response.Contents ?? []) {
				if (!item.Key) {
					continue;
				}
				results.push({
					key: item.Key,
					size: item.Size ?? 0,
					lastModified: item.LastModified,
					etag: item.ETag,
				});
			}
			continuationToken = response.NextContinuationToken;
		} while (continuationToken);
		return results;
	}

	async testConnection(): Promise<void> {
		await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
	}

	private normalizeKey(key: string): string {
		const normalized = key.replaceAll('\\', '/').replace(LEADING_SLASHES_REGEX, '');
		if (!normalized) {
			throw new Error('Storage key is required');
		}
		return normalized;
	}

	private async readBody(body: unknown): Promise<Buffer> {
		if (!body) {
			return Buffer.alloc(0);
		}
		if (typeof body === 'object' && body && 'transformToByteArray' in body) {
			const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
			return Buffer.from(bytes);
		}
		if (body instanceof Readable) {
			const chunks: Buffer[] = [];
			for await (const chunk of body) {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			}
			return Buffer.concat(chunks);
		}
		throw new Error('Unsupported S3 response body');
	}

	private toRangeHeader(range?: StorageRange): string | undefined {
		if (!range || (range.start === undefined && range.end === undefined)) {
			return undefined;
		}
		const start = range.start ?? 0;
		const end = range.end === undefined ? '' : `${range.end}`;
		return `bytes=${start}-${end}`;
	}

	private isMissingObjectError(error: unknown): boolean {
		if (!error || typeof error !== 'object') {
			return false;
		}
		const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
		return candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404;
	}
}
