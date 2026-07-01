import type { Readable } from "node:stream";
import parseTorrent from "parse-torrent";
import type { MediaType } from "$lib/types";

export interface TorrentFile {
	name: string;
	path: string;
	length: number;
	downloaded: number;
	progress: number;
	select(): void;
	deselect(): void;
	createReadStream(opts?: { start?: number; end?: number }): Readable;
}

export interface Torrent {
	files: TorrentFile[];
	infoHash: string;
	magnetURI: string;
	name: string;
	path: string;
	progress: number;
	downloaded: number;
	uploaded: number;
	downloadSpeed: number;
	uploadSpeed: number;
	numPeers: number;
	done: boolean;
	ready: boolean;
	paused: boolean;
	destroy(opts?: { destroyStore?: boolean }, callback?: () => void): void;
	on(event: "done" | "metadata" | "ready", callback: () => void): void;
	on(event: "upload" | "download", callback: (bytes: number) => void): void;
	on(event: "wire", callback: (wire: unknown) => void): void;
	on(event: "noPeers", callback: (announceType: string) => void): void;
	on(event: "warning" | "error", callback: (err: Error) => void): void;
	on(event: string, callback: (...args: unknown[]) => void): void;
	emit(event: string, ...args: unknown[]): boolean;
}

export interface WebTorrentClient {
	add(
		torrentId: string,
		opts?: { path?: string; announce?: string[] },
		callback?: (torrent: Torrent) => void
	): Torrent;
	remove(torrentId: string, opts?: { destroyStore?: boolean }, callback?: () => void): void;
	get(torrentId: string): Torrent | null;
	destroy(callback?: () => void): void;
	torrents: Torrent[];
	downloadSpeed: number;
	uploadSpeed: number;
	progress: number;
	ratio: number;
}

export interface ActiveDownload {
	mediaId: string;
	infohash: string;
	mediaType: MediaType;
	torrent: Torrent;
	videoFile: TorrentFile | null;
	videoFiles: TorrentFile[];
	subtitleFiles: TorrentFile[];
	selectedFileIndex: number | null;
	episodeMapping: Map<number, number>;
	progress: number;
	status: "initializing" | "downloading" | "finalizing" | "complete" | "error";
	activeStreams: number;
	totalSize: number;
	error?: string;
}

// Store active downloads keyed by infohash (allows multiple downloads per media)
export const activeDownloads = new Map<string, ActiveDownload>();

// Pending download promises keyed by infohash (prevents duplicate starts of same torrent)
export const pendingDownloads = new Map<string, Promise<void>>();

// Singleton WebTorrent client
let client: WebTorrentClient | null = null;

// Public trackers for better peer discovery
const TRACKERS = [
	"udp://tracker.opentrackr.org:1337/announce",
	"udp://open.tracker.cl:1337/announce",
	"udp://tracker.openbittorrent.com:6969/announce",
	"udp://open.stealth.si:80/announce",
	"udp://tracker.torrent.eu.org:451/announce",
	"udp://exodus.desync.com:6969/announce",
	"udp://tracker.moeking.me:6969/announce",
	"udp://explodie.org:6969/announce",
	"udp://tracker.dler.org:6969/announce",
	"udp://tracker.theoks.net:6969/announce",
	"http://tracker.openbittorrent.com:80/announce",
	"http://tracker.opentrackr.org:1337/announce",
];

export async function getClient(): Promise<WebTorrentClient> {
	if (!client) {
		// Suppress expected 'utp-native not found' warning during WebTorrent import
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			if (typeof args[0] === "string" && args[0].includes("uTP not supported")) {
				return;
			}
			originalError.apply(console, args);
		};

		const WebTorrent = await import("webtorrent");
		client = new WebTorrent.default({
			maxConns: 100,
			downloadLimit: -1,
			uploadLimit: -1,
		}) as unknown as WebTorrentClient;

		console.error = originalError;

		// Add global error handler
		(
			client as unknown as {
				on: (event: string, handler: (err: Error) => void) => void;
			}
		).on("error", (err: Error) => {
			console.error("[WebTorrent] Global client error:", err);
		});

		// console.log('[WebTorrent] Client initialized successfully');
	}
	return client;
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
export function getOrAddTorrent(
	torrentClient: WebTorrentClient,
	magnetLink: string,
	downloadPath: string,
	mediaId: string
): Torrent | null {
	let infoHash: string | undefined;
	try {
		const parsed = parseTorrent(magnetLink);
		if (typeof parsed === "string") {
			infoHash = parsed;
		} else if (parsed && typeof parsed === "object" && "infoHash" in parsed) {
			infoHash = parsed.infoHash;
		}
	} catch (e) {
		console.warn(`[${mediaId}] Failed to parse magnet link for infoHash check`, e);
	}

	const existing = infoHash ? torrentClient.get(infoHash) : null;
	if (existing) {
		// console.log(`[${mediaId}] Torrent already exists (cached), reusing: ${infoHash}`);
		return existing;
	}

	return torrentClient.add(magnetLink, {
		path: downloadPath,
		announce: TRACKERS,
	});
}

export function cleanupDownload(infohash: string, removeFiles: boolean): void {
	const download = activeDownloads.get(infohash);
	if (!download) {
		return;
	}

	download.torrent.destroy({ destroyStore: removeFiles }, () => {
		// console.log(`[${download.mediaId}:${infohash.slice(0, 8)}] Torrent destroyed`);
	});

	activeDownloads.delete(infohash);
}

export function hasActiveDownloads(): boolean {
	return activeDownloads.size > 0;
}
