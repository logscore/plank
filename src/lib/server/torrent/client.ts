import type { Readable } from "node:stream";
import WebTorrent from "webtorrent";
import type { MediaType } from "$lib/types";

export interface TorrentFile {
	createReadStream: (opts?: { start?: number; end?: number }) => Readable;
	deselect: () => void;
	downloaded: number;
	length: number;
	name: string;
	path: string;
	progress: number;
	select: () => void;
}

export interface Torrent {
	destroy: (opts?: { destroyStore?: boolean }, callback?: () => void) => void;
	done: boolean;
	downloaded: number;
	downloadSpeed: number;
	emit: (event: string, ...args: unknown[]) => boolean;
	files: TorrentFile[];
	infoHash: string;
	name: string;
	numPeers: number;
	on: {
		(event: "done" | "metadata" | "ready", callback: () => void): void;
		(event: "upload" | "download", callback: (bytes: number) => void): void;
		(event: "wire", callback: (wire: unknown) => void): void;
		(event: "noPeers", callback: (announceType: string) => void): void;
		(event: "warning" | "error", callback: (err: Error) => void): void;
		(event: string, callback: (...args: unknown[]) => void): void;
	};
	path: string;
	progress: number;
	ready: boolean;
}

export interface WebTorrentClient {
	add: (
		torrentId: string,
		opts?: { path?: string; announce?: string[] },
		callback?: (torrent: Torrent) => void
	) => Torrent;
	destroy: (callback?: (error?: Error | null) => void) => void;
	get: (torrentId: string) => Promise<Torrent | null>;
	on: (event: "error", callback: (error: Error) => void) => void;
	remove: (torrentId: string, opts?: { destroyStore?: boolean }, callback?: () => void) => void;
}

// shortcut: cancellation covers active torrents, extend it to uploads/recovery with the future job system.
export interface ActiveDownload {
	abortController: AbortController;
	episodeMapping: Map<number, number>;
	error?: string;
	finalization?: Promise<void>;
	infohash: string;
	mediaId: string;
	mediaType: MediaType;
	progress: number;
	status: "initializing" | "downloading" | "finalizing" | "complete" | "error";
	subtitleFiles: TorrentFile[];
	torrent: Torrent;
	totalSize: number;
	/** Finalization progress from 0 to 1. */
	transcodeProgress: number;
	videoFile: TorrentFile | null;
	videoFiles: TorrentFile[];
}

// Store active downloads keyed by infohash (allows multiple downloads per media)
export const activeDownloads = new Map<string, ActiveDownload>();

// Pending download promises keyed by infohash (prevents duplicate starts of same torrent)
export const pendingDownloads = new Map<string, Promise<void>>();

// Singleton WebTorrent client lifecycle
let clientPromise: Promise<WebTorrentClient> | null = null;
let clientShutdown: Promise<void> | null = null;
let shuttingDown = false;

// Public trackers for better peer discovery
const TRACKERS = [
	"udp://tracker.opentrackr.org:1337/announce",
	"udp://open.tracker.cl:1337/announce",
	"udp://open.stealth.si:80/announce",
	"udp://tracker.torrent.eu.org:451/announce",
];

export function getClient(): Promise<WebTorrentClient> {
	if (shuttingDown) {
		return Promise.reject(new Error("WebTorrent client is shutting down"));
	}
	if (!clientPromise) {
		const torrentClient = new WebTorrent({
			downloadLimit: -1,
			maxConns: 55,
			uploadLimit: -1,
		}) as unknown as WebTorrentClient;
		torrentClient.on("error", (error) => {
			console.error("[WebTorrent] Global client error:", error);
		});
		clientPromise = Promise.resolve(torrentClient);
	}
	return clientPromise;
}

export function shutdownTorrentClient(): Promise<void> {
	if (clientShutdown) {
		return clientShutdown;
	}

	shuttingDown = true;
	clientShutdown = (async () => {
		const torrentClient = await clientPromise;
		try {
			if (torrentClient) {
				await new Promise<void>((resolve, reject) => {
					torrentClient.destroy((error) => {
						if (error) {
							reject(error);
							return;
						}
						resolve();
					});
				});
			}
		} finally {
			clientPromise = null;
			activeDownloads.clear();
			pendingDownloads.clear();
		}
	})();
	return clientShutdown;
}

/** Get all active downloads for a media item */
export function getDownloadsForMedia(mediaId: string): ActiveDownload[] {
	const downloads: ActiveDownload[] = [];
	for (const download of activeDownloads.values()) {
		if (download.mediaId === mediaId) {
			downloads.push(download);
		}
	}
	return downloads;
}

export function getDownloadOwnerMediaId(mediaItem: {
	id: string;
	type: MediaType;
	parentId: string | null;
	magnetLink?: string | null;
	infohash?: string | null;
}): string {
	if (mediaItem.type === "episode" && mediaItem.parentId && !(mediaItem.magnetLink || mediaItem.infohash)) {
		return mediaItem.parentId;
	}
	return mediaItem.id;
}

function getEpisodeKey(mediaItem: { seasonNumber: number | null; episodeNumber: number | null }): number | null {
	if (mediaItem.seasonNumber === null || mediaItem.episodeNumber === null) {
		return null;
	}
	return mediaItem.seasonNumber * 100 + mediaItem.episodeNumber;
}

export function resolveEpisodeFileIndex(
	mediaItem: {
		type: MediaType;
		fileIndex: number | null;
		seasonNumber: number | null;
		episodeNumber: number | null;
	},
	downloads: ActiveDownload[]
): number | undefined {
	if (mediaItem.type !== "episode") {
		return mediaItem.fileIndex ?? undefined;
	}
	if (mediaItem.fileIndex !== null) {
		return mediaItem.fileIndex;
	}
	const episodeKey = getEpisodeKey(mediaItem);
	if (episodeKey === null) {
		return undefined;
	}
	return downloads
		.find((download) => download.mediaType === "show" && download.episodeMapping.has(episodeKey))
		?.episodeMapping.get(episodeKey);
}

/** Get or add torrent to client */
export async function getOrAddTorrent(
	torrentClient: WebTorrentClient,
	magnetLink: string,
	downloadPath: string
): Promise<Torrent> {
	const existing = await torrentClient.get(magnetLink);
	if (existing) {
		return existing;
	}

	return torrentClient.add(magnetLink, {
		announce: TRACKERS,
		path: downloadPath,
	});
}

// Destroy the client when no download needs it.
function releaseClientIfIdle(): void {
	if (shuttingDown || activeDownloads.size > 0 || pendingDownloads.size > 0) {
		return;
	}

	const idleClient = clientPromise;
	if (!idleClient) {
		return;
	}

	// Clear the handle first, so a download that starts during the destroy
	// builds a new client instead of using the one that is going away.
	clientPromise = null;
	idleClient
		.then((torrentClient) => {
			torrentClient.destroy(() => {
				console.log("[WebTorrent] Released idle client");
			});
		})
		.catch((error) => {
			console.error("[WebTorrent] Failed to release idle client:", error);
		});
}

export function cleanupDownload(infohash: string, removeFiles: boolean): void {
	const download = activeDownloads.get(infohash);
	if (!download) {
		return;
	}

	download.abortController.abort();
	download.torrent.destroy({ destroyStore: removeFiles });

	activeDownloads.delete(infohash);
	releaseClientIfIdle();
}

export function hasActiveDownloads(): boolean {
	return activeDownloads.size > 0;
}
