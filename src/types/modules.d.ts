declare module 'lucide-svelte' {
	import type { Component } from 'svelte';

	interface IconProps {
		class?: string;
		size?: number | string;
		color?: string;
		strokeWidth?: number | string;
	}

	export const Play: Component<IconProps>;
	export const ChevronDown: Component<IconProps>;
	export const ChevronRight: Component<IconProps>;
	export const User: Component<IconProps>;
	export const LogOut: Component<IconProps>;
	export const Plus: Component<IconProps>;
	export const RotateCcw: Component<IconProps>;
	export const Info: Component<IconProps>;
	export const Trash2: Component<IconProps>;
	export const X: Component<IconProps>;
	export const Film: Component<IconProps>;
	export const Search: Component<IconProps>;
	export const Loader2: Component<IconProps>;
	export const ArrowLeft: Component<IconProps>;
	export const Calendar: Component<IconProps>;
	export const Check: Component<IconProps>;
	export const Copy: Component<IconProps>;
	export const Database: Component<IconProps>;
	export const Folder: Component<IconProps>;
	export const AlertCircle: Component<IconProps>;
	export const HardDrive: Component<IconProps>;
	export const Key: Component<IconProps>;
	export const Mail: Component<IconProps>;
	export const MoreVertical: Component<IconProps>;
	export const EllipsisVertical: Component<IconProps>;
}

declare module 'parse-torrent' {
	interface ParsedTorrent {
		infoHash?: string;
		name?: string;
		[key: string]: any;
	}

	function parseTorrent(torrentId: string | Buffer): ParsedTorrent;
	export = parseTorrent;
}

declare module 'parse-torrent-title' {
	interface ParsedTitle {
		title: string;
		year?: number;
		resolution?: string;
		codec?: string;
		source?: string;
		group?: string;
		[key: string]: any;
	}

	export function parse(title: string): ParsedTitle;
}

declare module 'webtorrent' {
	import type { Readable } from 'node:stream';

	interface TorrentFile {
		name: string;
		path: string;
		length: number;
		downloaded: number;
		progress: number;
		select(): void;
		deselect(): void;
		createReadStream(opts?: { start?: number; end?: number }): Readable;
	}

	interface Torrent {
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
		on(event: 'done' | 'metadata' | 'ready', callback: () => void): void;
		on(event: 'upload' | 'download', callback: (bytes: number) => void): void;
		on(event: 'wire', callback: (wire: unknown) => void): void;
		on(event: 'noPeers', callback: (announceType: string) => void): void;
		on(event: 'warning' | 'error', callback: (err: Error) => void): void;
		on(event: string, callback: (...args: unknown[]) => void): void;
	}

	interface WebTorrentOptions {
		maxConns?: number;
		nodeId?: string | Buffer;
		peerId?: string | Buffer;
		tracker?: boolean | object;
		dht?: boolean | object;
		lsd?: boolean;
		webSeeds?: boolean;
		utp?: boolean;
		downloadLimit?: number;
		uploadLimit?: number;
	}

	interface AddOptions {
		path?: string;
		announce?: string[];
		maxWebConns?: number;
		store?: unknown;
	}

	class WebTorrent {
		constructor(opts?: WebTorrentOptions);
		add(torrentId: string | Buffer, opts?: AddOptions, callback?: (torrent: Torrent) => void): Torrent;
		seed(input: unknown, opts?: object, callback?: (torrent: Torrent) => void): Torrent;
		remove(torrentId: string | Torrent, opts?: { destroyStore?: boolean }, callback?: () => void): void;
		get(torrentId: string): Torrent | null;
		destroy(callback?: () => void): void;
		torrents: Torrent[];
		downloadSpeed: number;
		uploadSpeed: number;
		progress: number;
		ratio: number;
		on(event: 'torrent', callback: (torrent: Torrent) => void): void;
		on(event: 'error', callback: (err: Error) => void): void;
		on(event: string, callback: (...args: unknown[]) => void): void;
	}

	export = WebTorrent;
}
