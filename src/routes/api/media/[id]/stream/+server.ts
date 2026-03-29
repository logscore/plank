import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { createTransmuxStream, needsTransmux, requiresBrowserSafePlayback } from '$lib/server/ffmpeg';
import {
	getDownloadStatus,
	getVideoStream,
	isDownloadActive,
	startDownload,
	waitForVideoReady,
} from '$lib/server/torrent';
import type { RequestHandler } from './$types';

const FILE_EXTENSION_REGEX = /\.[^.]+$/;
const RANGE_BYTES_REGEX = /bytes=/;

const MIME_TYPES: Record<string, string> = {
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mkv': 'video/x-matroska',
	'.avi': 'video/x-msvideo',
	'.mov': 'video/quicktime',
	'.m4v': 'video/x-m4v',
};

function getMimeType(fileName: string): string {
	return MIME_TYPES[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

function silenceAbortErrors(stream: import('node:stream').Readable): ReadableStream {
	stream.on('error', (errorValue: NodeJS.ErrnoException) => {
		if (
			errorValue.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
			errorValue.code === 'ABORT_ERR' ||
			errorValue.name === 'AbortError'
		) {
			return;
		}
		console.error('[Stream] Unexpected stream error:', errorValue);
	});
	return stream as unknown as ReadableStream;
}

function resolveLibraryFile(mediaItem: { filePath: string | null }): string | null {
	if (!(mediaItem.filePath && existsSync(mediaItem.filePath))) {
		return null;
	}
	return mediaItem.filePath;
}

function checkDownloadError(mediaId: string): void {
	const status = getDownloadStatus(mediaId);
	if (status?.status === 'error') {
		throw error(503, status.error || 'Download failed - torrent may have no seeders');
	}
}

async function ensureVideoReady(
	mediaId: string,
	magnetLink: string | null,
	mediaStatus: string | null,
	fileIndex?: number
): Promise<Response | undefined> {
	checkDownloadError(mediaId);
	if (mediaStatus === 'pending' && magnetLink && !isDownloadActive(mediaId)) {
		try {
			await startDownload(mediaId, magnetLink);
		} catch (errorValue) {
			console.error('Failed to start download:', errorValue);
			throw error(500, 'Failed to start download');
		}
	}
	checkDownloadError(mediaId);
	const isReady = await waitForVideoReady(mediaId, fileIndex, 30_000);
	if (!isReady) {
		const status = getDownloadStatus(mediaId);
		if (status?.status === 'error') {
			throw error(503, status.error || 'Download failed');
		}
		if (status?.status === 'initializing') {
			return new Response(JSON.stringify({ message: 'Torrent is initializing, please try again shortly' }), {
				status: 202,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response(JSON.stringify({ message: 'Video is buffering, please wait...' }), {
			status: 202,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

function createTransmuxResponse(inputStream: import('node:stream').Readable, fileName: string): Response {
	const transmuxedStream = createTransmuxStream({
		inputStream,
		fileName,
		onError: (errorValue: Error) => console.error('[Stream] Transmux error:', errorValue),
	});
	return new Response(silenceAbortErrors(transmuxedStream), {
		status: 200,
		headers: {
			'Content-Type': 'video/mp4',
			'Content-Disposition': `inline; filename="${fileName.replace(FILE_EXTENSION_REGEX, '.mp4')}"`,
			'Cache-Control': 'no-cache',
		},
	});
}

async function shouldUseTransmuxForStream(
	fileName: string,
	isComplete: boolean,
	filePath?: string | null
): Promise<boolean> {
	if (needsTransmux(fileName)) {
		return true;
	}
	if (filePath && isComplete) {
		try {
			return await requiresBrowserSafePlayback(filePath);
		} catch (errorValue) {
			console.error('[Stream] Failed to probe playback compatibility:', errorValue);
			return true;
		}
	}
	if (isComplete) {
		return false;
	}
	return path.extname(fileName).toLowerCase() !== '.webm';
}

async function handleRangeRequest(
	mediaId: string,
	range: string,
	fileSize: number,
	fileName: string,
	mimeType: string
): Promise<Response> {
	const parts = range.replace(RANGE_BYTES_REGEX, '').split('-');
	const start = Number.parseInt(parts[0], 10);
	const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
	if (Number.isNaN(start) || start < 0 || start >= fileSize) {
		throw error(416, 'Requested range not satisfiable');
	}
	const clampedEnd = Math.min(end, fileSize - 1);
	const streamInfo = await getVideoStream(mediaId, start, clampedEnd);
	if (!streamInfo) {
		throw error(500, 'Failed to create ranged stream');
	}
	const contentLength = clampedEnd - start + 1;
	return new Response(silenceAbortErrors(streamInfo.stream), {
		status: 206,
		headers: {
			'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': contentLength.toString(),
			'Content-Type': mimeType,
			'Content-Disposition': `inline; filename="${fileName}"`,
			'Cache-Control': streamInfo.isComplete ? 'private, max-age=3600' : 'no-cache',
		},
	});
}

function resolveMedia(params: { id: string }, locals: App.Locals) {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	if (mediaItem.type === 'show') {
		throw error(400, 'Shows are not directly streamable');
	}
	return { mediaItem, fileIndex: mediaItem.fileIndex ?? undefined };
}

function serveLibraryRange(
	filePath: string,
	range: string,
	fileSize: number,
	fileName: string,
	mimeType: string
): Response {
	const parts = range.replace(RANGE_BYTES_REGEX, '').split('-');
	const start = Number.parseInt(parts[0], 10);
	const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
	if (Number.isNaN(start) || start < 0 || start >= fileSize) {
		throw error(416, 'Requested range not satisfiable');
	}
	const clampedEnd = Math.min(end, fileSize - 1);
	const contentLength = clampedEnd - start + 1;
	return new Response(silenceAbortErrors(createReadStream(filePath, { start, end: clampedEnd })), {
		status: 206,
		headers: {
			'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': contentLength.toString(),
			'Content-Type': mimeType,
			'Content-Disposition': `inline; filename="${fileName}"`,
			'Cache-Control': 'private, max-age=3600',
		},
	});
}

export const HEAD: RequestHandler = async ({ params, locals }) => {
	const { mediaItem, fileIndex } = resolveMedia(params, locals);
	const libraryPath = resolveLibraryFile(mediaItem);
	if (libraryPath) {
		const stats = statSync(libraryPath);
		const fileName = path.basename(libraryPath);
		const isTransmux = await shouldUseTransmuxForStream(fileName, true, libraryPath);
		const headers: Record<string, string> = {
			'Accept-Ranges': isTransmux ? 'none' : 'bytes',
			'Content-Type': isTransmux ? 'video/mp4' : getMimeType(fileName),
			'Content-Disposition': `inline; filename="${isTransmux ? fileName.replace(FILE_EXTENSION_REGEX, '.mp4') : fileName}"`,
			'Cache-Control': 'private, max-age=3600',
		};
		if (!isTransmux) {
			headers['Content-Length'] = stats.size.toString();
		}
		return new Response(null, {
			status: 200,
			headers,
		});
	}
	const readyResponse = await ensureVideoReady(mediaItem.id, mediaItem.magnetLink, mediaItem.status, fileIndex);
	if (readyResponse) {
		return new Response(null, { status: readyResponse.status, headers: readyResponse.headers });
	}
	const streamInfo = await getVideoStream(params.id);
	if (!streamInfo) {
		throw error(404, 'Video not available');
	}
	streamInfo.stream.destroy();
	const isTransmux = await shouldUseTransmuxForStream(streamInfo.fileName, streamInfo.isComplete);
	const headers: Record<string, string> = {
		'Accept-Ranges': isTransmux ? 'none' : 'bytes',
		'Content-Type': isTransmux ? 'video/mp4' : streamInfo.mimeType,
		'Content-Disposition': `inline; filename="${isTransmux ? streamInfo.fileName.replace(FILE_EXTENSION_REGEX, '.mp4') : streamInfo.fileName}"`,
		'Cache-Control': streamInfo.isComplete ? 'private, max-age=3600' : 'no-cache',
	};
	if (!isTransmux) {
		headers['Content-Length'] = streamInfo.fileSize.toString();
	}
	return new Response(null, {
		status: 200,
		headers,
	});
};

export const GET: RequestHandler = async ({ params, locals, request }) => {
	const { mediaItem, fileIndex } = resolveMedia(params, locals);
	const libraryPath = resolveLibraryFile(mediaItem);
	if (libraryPath) {
		const fileName = path.basename(libraryPath);
		if (await shouldUseTransmuxForStream(fileName, true, libraryPath)) {
			return createTransmuxResponse(createReadStream(libraryPath), fileName);
		}
		const stats = statSync(libraryPath);
		const mimeType = getMimeType(fileName);
		const range = request.headers.get('range');
		if (range) {
			return serveLibraryRange(libraryPath, range, stats.size, fileName, mimeType);
		}
		return new Response(silenceAbortErrors(createReadStream(libraryPath)), {
			status: 200,
			headers: {
				'Accept-Ranges': 'bytes',
				'Content-Length': stats.size.toString(),
				'Content-Type': mimeType,
				'Content-Disposition': `inline; filename="${fileName}"`,
				'Cache-Control': 'private, max-age=3600',
			},
		});
	}
	const readyResponse = await ensureVideoReady(mediaItem.id, mediaItem.magnetLink, mediaItem.status, fileIndex);
	if (readyResponse) {
		return readyResponse;
	}
	const streamInfo = await getVideoStream(params.id);
	if (!streamInfo) {
		throw error(404, 'Video not available');
	}
	if (await shouldUseTransmuxForStream(streamInfo.fileName, streamInfo.isComplete)) {
		return createTransmuxResponse(streamInfo.stream, streamInfo.fileName);
	}
	const range = request.headers.get('range');
	if (range) {
		streamInfo.stream.destroy();
		return handleRangeRequest(params.id, range, streamInfo.fileSize, streamInfo.fileName, streamInfo.mimeType);
	}
	return new Response(silenceAbortErrors(streamInfo.stream), {
		status: 200,
		headers: {
			'Accept-Ranges': 'bytes',
			'Content-Length': streamInfo.fileSize.toString(),
			'Content-Type': streamInfo.mimeType,
			'Content-Disposition': `inline; filename="${streamInfo.fileName}"`,
			'Cache-Control': streamInfo.isComplete ? 'private, max-age=3600' : 'no-cache',
		},
	});
};
