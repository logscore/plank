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
  import type { Readable } from 'stream';

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
    on(event: 'ready', callback: () => void): void;
    on(event: 'metadata', callback: () => void): void;
    on(event: 'done', callback: () => void): void;
    on(event: 'download', callback: (bytes: number) => void): void;
    on(event: 'upload', callback: (bytes: number) => void): void;
    on(event: 'wire', callback: (wire: unknown) => void): void;
    on(event: 'noPeers', callback: (announceType: string) => void): void;
    on(event: 'error', callback: (err: Error) => void): void;
    on(event: 'warning', callback: (err: Error) => void): void;
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
