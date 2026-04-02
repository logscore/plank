import { json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { downloadsDb, mediaDb } from '$lib/server/db';
import { parseMagnet } from '$lib/server/magnet';
import { resolveMagnetLink } from '$lib/server/prowlarr';
import { cancelDownload, deleteMediaFiles, startDownload } from '$lib/server/torrent';
import type { RequestHandler } from './$types';

async function removeExistingDownload(mediaId: string): Promise<void> {
	await cancelDownload(mediaId);
	await deleteMediaFiles(mediaId);
	downloadsDb.deleteByMediaId(mediaId);
}

function ensureDownloadRecord(mediaId: string, magnetLink: string, infohash: string): void {
	if (downloadsDb.getByInfohash(mediaId, infohash)) {
		return;
	}
	downloadsDb.create({
		mediaId,
		magnetLink,
		infohash,
		status: 'added',
		progress: 0,
	});
}

function markRetryStartFailed(mediaId: string, infohash: string, error: unknown): void {
	console.error(`Failed to start retried download for ${mediaId}:`, error);
	mediaDb.updateProgress(mediaId, 0, 'error');
	const download = downloadsDb.getByInfohash(mediaId, infohash);
	if (download) {
		downloadsDb.updateProgress(download.id, 0, 'error');
	}
}

function queueDownloadStart(mediaId: string, magnetLink: string, infohash: string): void {
	startDownload(mediaId, magnetLink).catch((error) => {
		markRetryStartFailed(mediaId, infohash, error);
	});
}

async function resolveReplacementSource(magnetLink: string): Promise<{ magnetLink: string; infohash: string }> {
	const resolvedMagnet = magnetLink.startsWith('http') ? await resolveMagnetLink(magnetLink) : magnetLink;
	if (!resolvedMagnet.startsWith('magnet:')) {
		throw new Error('Could not resolve a magnet link');
	}
	const parsedMagnet = parseMagnet(resolvedMagnet);
	if (!parsedMagnet.infohash) {
		throw new Error('Could not parse magnet infohash');
	}
	return { magnetLink: resolvedMagnet, infohash: parsedMagnet.infohash };
}

function queueReplacementSource(mediaId: string, magnetLink: string, infohash: string): Response {
	mediaDb.update(mediaId, {
		magnetLink,
		infohash,
	});
	ensureDownloadRecord(mediaId, magnetLink, infohash);
	queueDownloadStart(mediaId, magnetLink, infohash);
	return json({ success: true, message: 'Retry queued with manual source' }, { status: 202 });
}

function queueCurrentSource(mediaItem: NonNullable<ReturnType<typeof mediaDb.getById>>): Response {
	if (!mediaItem.magnetLink) {
		return json(
			{ success: false, message: 'No saved source is available. Paste a magnet link or torrent URL instead.' },
			{ status: 400 }
		);
	}
	const infohash = mediaItem.infohash ?? parseMagnet(mediaItem.magnetLink).infohash;
	if (!infohash) {
		return json(
			{ success: false, message: 'Could not parse the saved magnet link. Paste a new source instead.' },
			{ status: 400 }
		);
	}
	ensureDownloadRecord(mediaItem.id, mediaItem.magnetLink, infohash);
	queueDownloadStart(mediaItem.id, mediaItem.magnetLink, infohash);
	return json({ success: true, message: 'Retry queued with saved source' }, { status: 202 });
}

async function restartWithReplacementSource(mediaId: string, magnetLink: string): Promise<Response> {
	try {
		const replacement = await resolveReplacementSource(magnetLink);
		await removeExistingDownload(mediaId);
		mediaDb.resetDownload(mediaId);
		return queueReplacementSource(mediaId, replacement.magnetLink, replacement.infohash);
	} catch (error) {
		return json(
			{ success: false, message: error instanceof Error ? error.message : 'Failed to replace source' },
			{ status: 400 }
		);
	}
}

async function restartWithCurrentSource(mediaItem: NonNullable<ReturnType<typeof mediaDb.getById>>): Promise<Response> {
	if (!mediaItem.magnetLink) {
		return json(
			{ success: false, message: 'No saved source is available. Paste a magnet link or torrent URL instead.' },
			{ status: 400 }
		);
	}

	const infohash = mediaItem.infohash ?? parseMagnet(mediaItem.magnetLink).infohash;
	if (!infohash) {
		return json(
			{ success: false, message: 'Could not parse the saved magnet link. Paste a new source instead.' },
			{ status: 400 }
		);
	}

	await removeExistingDownload(mediaItem.id);
	mediaDb.resetDownload(mediaItem.id);
	return queueCurrentSource(mediaItem);
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	if (mediaItem.type === 'show') {
		return json({ success: false, message: 'Shows are not directly retryable' }, { status: 400 });
	}
	let body: { mode?: 'same' | 'replace' | 'remove'; magnetLink?: string } = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	const mode = body.mode ?? 'same';

	if (mode === 'remove') {
		await removeExistingDownload(mediaItem.id);
		mediaDb.markDownloadRemoved(mediaItem.id);
		return json({ success: true, message: 'Download removed' });
	}

	if (mode === 'replace') {
		if (!body.magnetLink) {
			return json({ success: false, message: 'A magnet link or torrent URL is required' }, { status: 400 });
		}
		return restartWithReplacementSource(mediaItem.id, body.magnetLink);
	}
	return restartWithCurrentSource(mediaItem);
};
