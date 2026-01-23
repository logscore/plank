import { error } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import {
	getDownloadStatus,
	getVideoStream,
	isDownloadActive,
	startDownload,
	waitForVideoReady,
} from '$lib/server/torrent';
import { createTransmuxStream, needsTransmux } from '$lib/server/transcoder';
import type { RequestHandler } from './$types';

// Regex patterns for stream handling
const FILE_EXTENSION_REGEX = /\.[^.]+$/;
const RANGE_BYTES_REGEX = /bytes=/;

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
			return new Response('Torrent is initializing, please try again shortly', { status: 202 });
		}
		return new Response('Video is buffering, please wait...', { status: 202 });
	}
}

/** Handle transmuxed stream response (MKV, AVI -> MP4) */
function createTransmuxResponse(
	inputStream: import('node:stream').Readable,
	fileName: string
): Response {
	// console.log(`[Stream] Transmuxing ${fileName} to MP4`);

	const transmuxedStream = createTransmuxStream({
		inputStream,
		onError: (err) => console.error('[Stream] Transmux error:', err),
	});

	return new Response(transmuxedStream as unknown as ReadableStream, {
		status: 200,
		headers: {
			'Content-Type': 'video/mp4',
			'Content-Disposition': `inline; filename="${fileName.replace(FILE_EXTENSION_REGEX, '.mp4')}"`,
			'Cache-Control': 'no-cache',
		},
	});
}

/** Handle range request for video streaming */
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

	return new Response(rangedStreamInfo.stream as unknown as ReadableStream, {
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

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	// Get optional episodeId for TV shows
	const episodeId = url.searchParams.get('episodeId') ?? undefined;

	const readyResponse = await ensureVideoReady(
		mediaItem.id,
		mediaItem.magnetLink,
		mediaItem.status ?? 'added',
		undefined // fileIndex no longer used
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
	return new Response(stream as unknown as ReadableStream, {
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
