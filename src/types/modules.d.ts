declare module "parse-torrent" {
	interface ParsedTorrent {
		infoHash?: string;
		name?: string;
		[key: string]: any;
	}

	export default function parseTorrent(torrentId: string | Buffer): Promise<ParsedTorrent>;
	export function toMagnetURI(torrent: ParsedTorrent): string;
}

declare module "parse-torrent-title" {
	interface ParsedTitle {
		codec?: string;
		group?: string;
		resolution?: string;
		source?: string;
		title: string;
		year?: number;
		[key: string]: any;
	}

	export function parse(title: string): ParsedTitle;
}

declare module "webtorrent" {
	import type { Readable } from "node:stream";

	interface TorrentFile {
		createReadStream: (opts?: { start?: number; end?: number }) => Readable;
		deselect: () => void;
		downloaded: number;
		length: number;
		name: string;
		path: string;
		progress: number;
		select: () => void;
	}

	interface Torrent {
		destroy: (opts?: { destroyStore?: boolean }, callback?: () => void) => void;
		done: boolean;
		downloaded: number;
		downloadSpeed: number;
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
		uploadSpeed: number;
	}

	interface WebTorrentOptions {
		dht?: boolean | object;
		downloadLimit?: number;
		lsd?: boolean;
		maxConns?: number;
		nodeId?: string | Buffer;
		peerId?: string | Buffer;
		tracker?: boolean | object;
		uploadLimit?: number;
		utp?: boolean;
		webSeeds?: boolean;
	}

	interface AddOptions {
		announce?: string[];
		maxWebConns?: number;
		path?: string;
		store?: unknown;
	}

	class WebTorrent {
		constructor(opts?: WebTorrentOptions);
		add(torrentId: string | Buffer, opts?: AddOptions, callback?: (torrent: Torrent) => void): Torrent;
		seed(input: unknown, opts?: object, callback?: (torrent: Torrent) => void): Torrent;
		remove(torrentId: string | Torrent, opts?: { destroyStore?: boolean }, callback?: () => void): void;
		get(torrentId: string): Promise<Torrent | null>;
		destroy(callback?: () => void): void;
		downloadSpeed: number;
		uploadSpeed: number;
		progress: number;
		on(event: "torrent", callback: (torrent: Torrent) => void): void;
		on(event: "error", callback: (err: Error) => void): void;
		on(event: string, callback: (...args: unknown[]) => void): void;
	}

	export = WebTorrent;
}
