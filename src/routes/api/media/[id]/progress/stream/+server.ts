import { isTerminalProgressStatus } from '$lib/progress-status';
import { requireMediaAccess } from '$lib/server/api-guard';
import { getMediaProgressSnapshot } from '$lib/server/media-progress';
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

export const GET: RequestHandler = async ({ params, locals }) => {
	const { organizationId, mediaItem } = requireMediaAccess(locals, params.id);

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
			let isTerminal = isTerminalProgressStatus(mediaItem.status);

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
					const data = getMediaProgressSnapshot(params.id, organizationId);
					if (!data) {
						closeStream();
						return;
					}

					if (isClosed) {
						return;
					}

					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

					if (isTerminalProgressStatus(data.status) && !isTerminal) {
						isTerminal = true;
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

			if (isTerminal) {
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
