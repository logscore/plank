import { error } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import { getDownloadStatus, isDownloadActive } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

/** Check if an error is an invalid state error (expected during cleanup) */
function isControllerClosedError(e: unknown): boolean {
	return (
		e instanceof TypeError &&
		typeof e === 'object' &&
		e !== null &&
		'code' in e &&
		(e as { code?: string }).code === 'ERR_INVALID_STATE'
	);
}

/** Build progress data object from current state */
function buildProgressData(mediaId: string, userId?: string) {
	const downloadStatus = getDownloadStatus(mediaId);
	const currentMedia = userId ? mediaDb.get(mediaId, userId) : mediaDb.getById(mediaId);

	return {
		status: downloadStatus?.status ?? currentMedia?.status ?? 'added',
		progress: downloadStatus?.progress ?? currentMedia?.progress ?? 0,
		downloadSpeed: downloadStatus?.downloadSpeed ?? 0,
		uploadSpeed: downloadStatus?.uploadSpeed ?? 0,
		peers: downloadStatus?.peers ?? 0,
		isActive: isDownloadActive(mediaId),
		filePath: currentMedia?.filePath,
		error: downloadStatus?.error,
		fileSize: downloadStatus?.totalSize ?? currentMedia?.fileSize,
	};
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const mediaItem = mediaDb.get(params.id, locals.user.id);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	const encoder = new TextEncoder();
	let isClosed = false;
	let interval: ReturnType<typeof setInterval> | null = null;

	const cleanup = () => {
		isClosed = true;
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
	};

	const stream = new ReadableStream({
		start(controller) {
			let isComplete = mediaItem.status === 'complete';

			const closeStream = () => {
				if (isClosed) {
					return;
				}
				cleanup();
				try {
					controller.close();
				} catch {
					// Already closed
				}
			};

			const sendData = () => {
				if (isClosed) {
					return;
				}

				try {
					const data = buildProgressData(params.id, locals.user?.id);

					if (isClosed) {
						return;
					}

					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

					if (data.status === 'complete' && !isComplete) {
						isComplete = true;
						setTimeout(closeStream, 500);
					}
				} catch (e) {
					if (!isControllerClosedError(e)) {
						console.error('SSE error:', e);
					}
					closeStream();
				}
			};

			sendData();

			if (isComplete) {
				setTimeout(closeStream, 100);
				return;
			}

			interval = setInterval(sendData, 1000);
		},
		cancel() {
			cleanup();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
};
