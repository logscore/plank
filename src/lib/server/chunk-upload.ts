// Receives files in small chunks, so uploads fit under the default SvelteKit body size limit
// FEATURE: Chunked uploads for videos and images

import fs from "node:fs/promises";
import path from "node:path";
import { error } from "@sveltejs/kit";
import { assert, formatFileSize, UPLOAD_CHUNK_BYTES } from "$lib/utils";

const DIGITS_PATTERN = /^\d+$/;

function readByteCount(url: URL, name: string): number {
	const raw = url.searchParams.get(name) ?? "";
	const value = Number(raw);
	if (!(DIGITS_PATTERN.test(raw) && Number.isSafeInteger(value))) {
		throw error(400, `${name} must be a whole number`);
	}
	return value;
}

/** Read `?offset=&size=` and the raw chunk body. Bad input gets a 4xx response. */
export async function readChunkRequest(
	request: Request,
	url: URL,
	fileBytesMax: number
): Promise<{ chunk: Uint8Array; fileSize: number; offset: number }> {
	const fileSize = readByteCount(url, "size");
	const offset = readByteCount(url, "offset");
	if (fileSize === 0) {
		throw error(400, "The file is empty");
	}
	if (fileSize > fileBytesMax) {
		throw error(413, `The file is larger than ${formatFileSize(fileBytesMax)}`);
	}
	const chunk = new Uint8Array(await request.arrayBuffer());
	if (chunk.length === 0) {
		throw error(400, "The chunk is empty");
	}
	if (chunk.length > UPLOAD_CHUNK_BYTES) {
		throw error(413, "The chunk is too large");
	}
	if (offset + chunk.length > fileSize) {
		throw error(400, "The chunk goes past the end of the file");
	}
	return { chunk, fileSize, offset };
}

/**
 * Append one chunk and return the byte count the file holds. Offset zero starts a new file.
 * A chunk at the wrong offset is not written, so a resent chunk cannot corrupt the file.
 */
export async function appendChunk(
	partPath: string,
	fileSize: number,
	offset: number,
	chunk: Uint8Array
): Promise<number> {
	assert(chunk.length > 0, "appendChunk: chunk must not be empty");
	assert(chunk.length <= UPLOAD_CHUNK_BYTES, "appendChunk: chunk must fit the chunk size");
	assert(offset + chunk.length <= fileSize, "appendChunk: chunk must end inside the file");

	await fs.mkdir(path.dirname(partPath), { recursive: true });
	// "w" empties the file for a new upload. "a" creates it when it is missing.
	const file = await fs.open(partPath, offset === 0 ? "w" : "a");
	try {
		const { size: received } = await file.stat();
		if (offset !== received) {
			return received;
		}
		await file.write(chunk);
		const total = received + chunk.length;
		assert(total <= fileSize, "appendChunk: file must not pass its size");
		return total;
	} finally {
		await file.close();
	}
}
