// Opens a single SSE connection for live movie and episode progress
// FEATURE: Live progress transport for movie and episode download monitoring

import { browser } from '$app/environment';
import { isTerminalProgressStatus } from '$lib/progress-status';
import type { ProgressInfo } from '$lib/queries/media-queries';

export function connectMediaProgressStream(
	mediaId: string,
	onData: (progress: ProgressInfo) => void,
	onClose?: () => void
): () => void {
	if (!(browser && mediaId)) {
		return () => undefined;
	}
	let closed = false;
	const eventSource = new EventSource(`/api/media/${mediaId}/progress/stream`);
	const close = () => {
		if (closed) {
			return;
		}
		closed = true;
		eventSource.close();
		onClose?.();
	};
	const handleMessage = (event: MessageEvent<string>) => {
		try {
			const progress = JSON.parse(event.data) as ProgressInfo;
			onData(progress);
			if (isTerminalProgressStatus(progress.status)) {
				close();
			}
		} catch (errorValue) {
			console.error('Failed to parse progress stream payload:', errorValue);
			close();
		}
	};
	eventSource.onmessage = handleMessage;
	eventSource.onerror = close;
	return close;
}
