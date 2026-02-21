import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { episodesDb, mediaDb } from '$lib/server/db';
import { createTransmuxStream, needsTransmux } from '$lib/server/ffmpeg';
import {
	getDownloadStatus,
	getVideoStream,
	isDownloadActive,
	startDownload,
	waitForVideoReady,
} from '$lib/server/torrent';
import type { RequestHandler } from './$types';

// Regex patterns for stream handling
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

/** Silence expected abort errors when the client disconnects mid-stream */
function silenceAbortErrors(stream: import('node:stream').Readable): ReadableStream {
	stream.on('error', (err: NodeJS.ErrnoException) => {
		if (err.code === 'ERR_STREAM_PREMATURE_CLOSE' || err.code === 'ABORT_ERR' || err.name === 'AbortError') {
			return;
		}
		console.error('[Stream] Unexpected stream error:', err);
	});
	return stream as unknown as ReadableStream;
}

/** Resolve the on-disk library file path for a completed media item */
function resolveLibraryFile(mediaItem: { type: string; filePath: string | null }, episodeId?: string): string | null {
	if (mediaItem.type === 'movie' && mediaItem.filePath && existsSync(mediaItem.filePath)) {
		return mediaItem.filePath;
	}
	if (mediaItem.type === 'tv' && episodeId) {
		const episode = episodesDb.getById(episodeId);
		if (episode?.filePath && existsSync(episode.filePath)) {
			return episode.filePath;
		}
	}
	return null;
}

/** Check download status and throw appropriate error if failed */
function checkDownloadError(mediaId: string): void {
	const status = getDownloadStatus(mediaId);
	if (status?.status === 'error') {
		throw error(503, status.error || 'Download failed - torrent may have no seeders');
	}
}

/** Ensure media download is started and video is ready */
async function ensureVideoReady(
	mediaId: string,
	magnetLink: string,
	mediaStatus: string,
	fileIndex?: number
): Promise<Response | undefined> {
	checkDownloadError(mediaId);

	// Start download if needed
	if (mediaStatus === 'added' && !isDownloadActive(mediaId)) {
		try {
			await startDownload(mediaId, magnetLink);
		} catch (e) {
			console.error('Failed to start download:', e);
			throw error(500, 'Failed to start download');
		}
	}

	checkDownloadError(mediaId);

	// Wait for video to be ready
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

/** Handle transmuxed stream response (MKV, AVI -> MP4) */
function createTransmuxResponse(inputStream: import('node:stream').Readable, fileName: string): Response {
	const transmuxedStream = createTransmuxStream({
		inputStream,
		onError: (err: Error) => console.error('[Stream] Transmux error:', err),
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

/** Handle range request for video streaming (torrent/download path) */
async function handleRangeRequest(
	mediaId: string,
	range: string,
	fileSize: number,
	fileName: string,
	mimeType: string,
	episodeId?: string
): Promise<Response> {
	const parts = range.replace(RANGE_BYTES_REGEX, '').split('-');
	const start = Number.parseInt(parts[0], 10);
	const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;

	if (Number.isNaN(start) || start < 0 || start >= fileSize) {
		throw error(416, 'Requested range not satisfiable');
	}

	const clampedEnd = Math.min(end, fileSize - 1);
	const rangedStreamInfo = await getVideoStream(mediaId, episodeId, start, clampedEnd);
	if (!rangedStreamInfo) {
		throw error(500, 'Failed to create ranged stream');
	}

	const contentLength = clampedEnd - start + 1;

	return new Response(silenceAbortErrors(rangedStreamInfo.stream), {
		status: 206,
		headers: {
			'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': contentLength.toString(),
			'Content-Type': mimeType,
			'Content-Disposition': `inline; filename="${fileName}"`,
			'Cache-Control': rangedStreamInfo.isComplete ? 'private, max-age=3600' : 'no-cache',
		},
	});
}

/** Resolve media item, episode, and file index from request params */
function resolveMedia(params: { id: string }, locals: App.Locals, url: URL) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	const episodeId = url.searchParams.get('episodeId') ?? undefined;
	let fileIndex: number | undefined;

	if (mediaItem.type === 'tv') {
		if (!episodeId) {
			throw error(400, 'Episode ID required for TV shows');
		}
		const episode = episodesDb.getById(episodeId);
		if (!episode) {
			throw error(404, 'Episode not found');
		}
		fileIndex = episode.fileIndex ?? undefined;
	}

	return { mediaItem, episodeId, fileIndex };
}

/** Serve a library file range request directly from disk */
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

export const HEAD: RequestHandler = async ({ params, locals, url }) => {
	const { mediaItem, episodeId, fileIndex } = resolveMedia(params, locals, url);

	// Fast path: file already in library — use stat, no stream needed
	const libraryPath = resolveLibraryFile(mediaItem, episodeId);
	if (libraryPath) {
		const stats = statSync(libraryPath);
		const fileName = path.basename(libraryPath);
		const isTransmux = needsTransmux(fileName);

		return new Response(null, {
			status: 200,
			headers: {
				'Accept-Ranges': isTransmux ? 'none' : 'bytes',
				'Content-Length': stats.size.toString(),
				'Content-Type': isTransmux ? 'video/mp4' : getMimeType(fileName),
				'Content-Disposition': `inline; filename="${fileName}"`,
				'Cache-Control': 'private, max-age=3600',
			},
		});
	}

	// Slow path: file is still downloading
	const readyResponse = await ensureVideoReady(
		mediaItem.id,
		mediaItem.magnetLink,
		mediaItem.status ?? 'added',
		fileIndex
	);

	if (readyResponse) {
		return new Response(null, { status: readyResponse.status, headers: readyResponse.headers });
	}

	const streamInfo = await getVideoStream(params.id, episodeId);
	if (!streamInfo) {
		throw error(404, 'Video not available');
	}

	// Immediately destroy the stream — HEAD only needs metadata
	streamInfo.stream.destroy();

	const { fileSize, fileName, mimeType, isComplete } = streamInfo;
	const contentType = needsTransmux(fileName) ? 'video/mp4' : mimeType;

	return new Response(null, {
		status: 200,
		headers: {
			'Accept-Ranges': needsTransmux(fileName) ? 'none' : 'bytes',
			'Content-Length': fileSize.toString(),
			'Content-Type': contentType,
			'Content-Disposition': `inline; filename="${fileName}"`,
			'Cache-Control': isComplete ? 'private, max-age=3600' : 'no-cache',
		},
	});
};

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	const { mediaItem, episodeId, fileIndex } = resolveMedia(params, locals, url);

	// Fast path: file already in library — serve directly from disk
	const libraryPath = resolveLibraryFile(mediaItem, episodeId);
	if (libraryPath) {
		const fileName = path.basename(libraryPath);

		// Transmux non-native formats (MKV, AVI, etc.)
		if (needsTransmux(fileName)) {
			return createTransmuxResponse(createReadStream(libraryPath), fileName);
		}

		// Native format (MP4, WebM) — serve with range support, single stream
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

	// Slow path: file is still downloading — use torrent streaming
	const readyResponse = await ensureVideoReady(
		mediaItem.id,
		mediaItem.magnetLink,
		mediaItem.status ?? 'added',
		fileIndex
	);

	if (readyResponse) {
		return readyResponse;
	}

	const streamInfo = await getVideoStream(params.id, episodeId);
	if (!streamInfo) {
		throw error(404, 'Video not available');
	}

	const { fileSize, fileName, mimeType, stream, isComplete } = streamInfo;

	// Handle transmuxing for non-native formats
	if (needsTransmux(fileName)) {
		return createTransmuxResponse(stream, fileName);
	}

	// Handle range requests for native formats
	const range = request.headers.get('range');
	if (range) {
		stream.destroy();
		return handleRangeRequest(params.id, range, fileSize, fileName, mimeType, episodeId);
	}

	// Full file response
	return new Response(silenceAbortErrors(stream), {
		status: 200,
		headers: {
			'Accept-Ranges': 'bytes',
			'Content-Length': fileSize.toString(),
			'Content-Type': mimeType,
			'Content-Disposition': `inline; filename="${fileName}"`,
			'Cache-Control': isComplete ? 'private, max-age=3600' : 'no-cache',
		},
	});
};
