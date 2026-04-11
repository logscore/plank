import type { Readable } from 'node:stream';

export interface StorageRange {
	start?: number;
	end?: number;
}

export interface StorageMetadata {
	key: string;
	size: number;
	lastModified?: Date;
	contentType?: string;
	etag?: string;
}

export interface StorageListItem extends StorageMetadata {}

export interface StorageWriteOptions {
	contentLength?: number;
	contentType?: string;
}

export interface StorageAdapter {
	write(key: string, data: Buffer | Uint8Array | string, options?: StorageWriteOptions): Promise<void>;
	writeStream(key: string, stream: Readable, options?: StorageWriteOptions): Promise<void>;
	writeFromLocalPath(key: string, localPath: string, options?: StorageWriteOptions): Promise<void>;
	read(key: string): Promise<Buffer>;
	readStream(key: string, range?: StorageRange): Promise<Readable>;
	exists(key: string): Promise<boolean>;
	metadata(key: string): Promise<StorageMetadata | null>;
	delete(key: string): Promise<void>;
	deletePrefix(prefix: string): Promise<void>;
	list(prefix: string): Promise<StorageListItem[]>;
	testConnection(): Promise<void>;
}

export interface LocalStorageConfig {
	provider: 'local';
	basePath: string;
}

export interface S3StorageConfig {
	provider: 's3';
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	endpoint?: string;
	forcePathStyle?: boolean;
}

export type StorageConfig = LocalStorageConfig | S3StorageConfig;
export type StorageProvider = StorageConfig['provider'];
