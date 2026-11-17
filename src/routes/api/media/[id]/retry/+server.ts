import { json } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { downloadsDb, mediaDb } from "$lib/server/db";
import type { Download, Media } from "$lib/server/db/schema";
import { resolveMagnetLink } from "$lib/server/prowlarr";
import { cancelDownload, cancelDownloadByInfohash, startDownload } from "$lib/server/torrent/download";
import { parseMagnet } from "$lib/server/torrent/files";
import { deleteDownloadTempFiles, deleteMediaFiles } from "$lib/server/torrent/finalize";
import type { RequestHandler } from "./$types";

interface RetryBody {
	mode?: "same" | "replace" | "remove";
	magnetLink?: string;
	downloadId?: string;
}

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
		status: "added",
		progress: 0,
	});
}

function markRetryStartFailed(mediaId: string, infohash: string, error: unknown): void {
	console.error(`Failed to start retried download for ${mediaId}:`, error);
	mediaDb.updateProgress(mediaId, 0, "error");
	const download = downloadsDb.getByInfohash(mediaId, infohash);
	if (download) {
		downloadsDb.updateProgress(download.id, 0, "error");
	}
}

function queueDownloadStart(mediaId: string, magnetLink: string, infohash: string): void {
	startDownload(mediaId, magnetLink).catch((error) => {
		markRetryStartFailed(mediaId, infohash, error);
	});
}

interface Source {
	magnetLink: string;
	infohash: string;
}

/** Resolve a pasted magnet link or torrent URL. Gives a 400 response when it cannot. */
async function resolveNewSource(magnetLink: string): Promise<Source | Response> {
	const fail = (message: string) => json({ success: false, message }, { status: 400 });
	try {
		const resolvedMagnet = magnetLink.startsWith("http") ? await resolveMagnetLink(magnetLink) : magnetLink;
		if (!resolvedMagnet.startsWith("magnet:")) {
			return fail("Could not resolve a magnet link");
		}
		const infohash = parseMagnet(resolvedMagnet).infohash;
		if (!infohash) {
			return fail("Could not parse magnet infohash");
		}
		return { magnetLink: resolvedMagnet, infohash };
	} catch (error) {
		return fail(error instanceof Error ? error.message : "Failed to replace source");
	}
}

function queueReplacementSource(mediaId: string, magnetLink: string, infohash: string): Response {
	mediaDb.update(mediaId, {
		magnetLink,
		infohash,
	});
	ensureDownloadRecord(mediaId, magnetLink, infohash);
	queueDownloadStart(mediaId, magnetLink, infohash);
	return json({ success: true, message: "Retry queued with manual source" }, { status: 202 });
}

function queueCurrentSource(mediaItem: Media): Response {
	if (!mediaItem.magnetLink) {
		return json(
			{ success: false, message: "No saved source is available. Paste a magnet link or torrent URL instead." },
			{ status: 400 }
		);
	}
	const infohash = mediaItem.infohash ?? parseMagnet(mediaItem.magnetLink).infohash;
	if (!infohash) {
		return json(
			{ success: false, message: "Could not parse the saved magnet link. Paste a new source instead." },
			{ status: 400 }
		);
	}
	ensureDownloadRecord(mediaItem.id, mediaItem.magnetLink, infohash);
	queueDownloadStart(mediaItem.id, mediaItem.magnetLink, infohash);
	return json({ success: true, message: "Retry queued with saved source" }, { status: 202 });
}

async function restartWithReplacementSource(mediaId: string, magnetLink: string): Promise<Response> {
	const source = await resolveNewSource(magnetLink);
	if (source instanceof Response) {
		return source;
	}
	await removeExistingDownload(mediaId);
	mediaDb.resetDownload(mediaId);
	return queueReplacementSource(mediaId, source.magnetLink, source.infohash);
}

async function restartWithCurrentSource(mediaItem: Media): Promise<Response> {
	if (!mediaItem.magnetLink) {
		return json(
			{ success: false, message: "No saved source is available. Paste a magnet link or torrent URL instead." },
			{ status: 400 }
		);
	}

	const infohash = mediaItem.infohash ?? parseMagnet(mediaItem.magnetLink).infohash;
	if (!infohash) {
		return json(
			{ success: false, message: "Could not parse the saved magnet link. Paste a new source instead." },
			{ status: 400 }
		);
	}

	await removeExistingDownload(mediaItem.id);
	mediaDb.resetDownload(mediaItem.id);
	return queueCurrentSource(mediaItem);
}

function updateShowStatusFromDownloads(mediaId: string): void {
	const downloads = downloadsDb.getByMediaId(mediaId);
	if (downloads.some((download) => download.status === "error")) {
		mediaDb.updateProgress(mediaId, 0, "error");
		return;
	}
	if (downloads.some((download) => download.status === "added" || download.status === "downloading")) {
		mediaDb.updateProgress(mediaId, 0, "downloading");
		return;
	}
	if (downloads.some((download) => download.status === "complete")) {
		mediaDb.updateProgress(mediaId, 1, "complete");
		return;
	}
	mediaDb.markDownloadRemoved(mediaId);
}

async function removeShowDownload(download: Download): Promise<Response> {
	await cancelDownloadByInfohash(download.mediaId, download.infohash);
	await deleteDownloadTempFiles(download.mediaId, download.infohash);
	downloadsDb.delete(download.id);
	updateShowStatusFromDownloads(download.mediaId);
	return json({ success: true, message: "Show download removed" });
}

async function restartShowDownload(download: Download, magnetLink: string, infohash: string): Promise<Response> {
	const duplicate = downloadsDb.getByInfohash(download.mediaId, infohash);
	if (duplicate && duplicate.id !== download.id) {
		return json({ success: false, message: "This source is already attached to the show" }, { status: 409 });
	}
	await cancelDownloadByInfohash(download.mediaId, download.infohash);
	await deleteDownloadTempFiles(download.mediaId, download.infohash);
	downloadsDb.updateSource(download.id, magnetLink, infohash);
	mediaDb.updateProgress(download.mediaId, 0, "pending");
	queueDownloadStart(download.mediaId, magnetLink, infohash);
	return json({ success: true, message: "Show download retry queued" }, { status: 202 });
}

/** A show can hold more than one season pack, so a retry works on one download row. */
async function handleShowRetry(mediaItem: Media, body: RetryBody): Promise<Response> {
	const mode = body.mode ?? "same";
	const download = body.downloadId ? downloadsDb.getById(body.downloadId) : undefined;
	if (body.downloadId && download?.mediaId !== mediaItem.id) {
		return json({ success: false, message: "Show download not found" }, { status: 404 });
	}

	if (mode === "remove") {
		if (download) {
			return removeShowDownload(download);
		}
		mediaDb.markDownloadRemoved(mediaItem.id);
		return json({ success: true, message: "Show download removed" });
	}

	let source: Source = download ?? { magnetLink: "", infohash: "" };
	if (mode === "replace") {
		if (!body.magnetLink) {
			return json({ success: false, message: "A magnet link or torrent URL is required" }, { status: 400 });
		}
		const resolved = await resolveNewSource(body.magnetLink);
		if (resolved instanceof Response) {
			return resolved;
		}
		source = resolved;
	}

	if (download) {
		return restartShowDownload(download, source.magnetLink, source.infohash);
	}
	mediaDb.updateProgress(mediaItem.id, 0, "pending");
	return mode === "replace"
		? queueReplacementSource(mediaItem.id, source.magnetLink, source.infohash)
		: queueCurrentSource(mediaItem);
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	let body: RetryBody = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	if (mediaItem.type === "show") {
		return handleShowRetry(mediaItem, body);
	}
	const mode = body.mode ?? "same";
	if (mode === "remove") {
		await removeExistingDownload(mediaItem.id);
		mediaDb.markDownloadRemoved(mediaItem.id);
		return json({ success: true, message: "Download removed" });
	}
	if (mode === "replace") {
		if (!body.magnetLink) {
			return json({ success: false, message: "A magnet link or torrent URL is required" }, { status: 400 });
		}
		return restartWithReplacementSource(mediaItem.id, body.magnetLink);
	}
	return restartWithCurrentSource(mediaItem);
};
