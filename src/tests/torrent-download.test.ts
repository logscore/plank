import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveDownload } from "../lib/server/torrent/client";
import { startDownload } from "../lib/server/torrent/download";
import { getDownloadStatus } from "../lib/server/torrent/status";

const mocks = vi.hoisted(() => ({
	activeDownloads: new Map<string, ActiveDownload>(),
	cleanupDownload: vi.fn(),
	downloadGetByInfohash: vi.fn(() => ({ id: "download-1" })),
	downloadUpdateProgress: vi.fn(),
	findVideoFile: vi.fn(),
	getClient: vi.fn(async () => ({})),
	getOrAddTorrent: vi.fn(),
	mediaGetById: vi.fn(() => ({ id: "media-1", type: "movie", tmdbId: 1 })),
	mediaUpdateProgress: vi.fn(),
	mkdir: vi.fn(),
	moveToLibrary: vi.fn(),
	parseMagnet: vi.fn(() => ({ infohash: "hash-1", name: "Movie" })),
	pendingDownloads: new Map(),
	stopClientIfIdle: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	default: { mkdir: mocks.mkdir },
}));

vi.mock("../lib/server/db", () => ({
	downloadsDb: {
		getByInfohash: mocks.downloadGetByInfohash,
		updateProgress: mocks.downloadUpdateProgress,
	},
	mediaDb: {
		getById: mocks.mediaGetById,
		updateProgress: mocks.mediaUpdateProgress,
	},
}));

vi.mock("../lib/server/ffmpeg", () => ({
	SUPPORTED_VIDEO_FORMATS: [".mp4"],
}));

vi.mock("../lib/server/paths", () => ({
	PATHS: { library: "/library", temp: "/temp" },
}));

vi.mock("../lib/server/settings", () => ({ getSettings: vi.fn() }));
vi.mock("../lib/server/tmdb", () => ({ searchMovie: vi.fn(), searchTVShow: vi.fn() }));

vi.mock("../lib/server/torrent/client", () => ({
	activeDownloads: mocks.activeDownloads,
	cleanupDownload: mocks.cleanupDownload,
	getClient: mocks.getClient,
	getDownloadsForMedia: vi.fn(() => Array.from(mocks.activeDownloads.values())),
	getDownloadOwnerMediaId: vi.fn((media: { id: string }) => media.id),
	getOrAddTorrent: mocks.getOrAddTorrent,
	pendingDownloads: mocks.pendingDownloads,
	stopClientIfIdle: mocks.stopClientIfIdle,
}));

vi.mock("../lib/server/torrent/files", () => ({
	autoNumberFiles: vi.fn(),
	findSubtitleFiles: vi.fn(() => []),
	findVideoFile: mocks.findVideoFile,
	findVideoFiles: vi.fn(() => []),
	mapFilesToEpisodes: vi.fn(),
	parseMagnet: mocks.parseMagnet,
}));

vi.mock("../lib/server/torrent/finalize", () => ({
	createEpisodesFromMapping: vi.fn(),
	moveToLibrary: mocks.moveToLibrary,
}));

class FakeTorrent extends EventEmitter {
	files: unknown[] = [];
	infoHash = "hash-1";
	downloaded = 0;
	path = "/temp/media-1/hash-1";
	ready = false;
	done = false;
}

describe("torrent finalization", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.activeDownloads.clear();
		mocks.pendingDownloads.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("destroys torrent resources when library finalization fails", async () => {
		const torrent = new FakeTorrent();
		const videoFile = {
			name: "Movie.mp4",
			path: "Movie.mp4",
			length: 100,
			downloaded: 100,
			progress: 1,
			select: vi.fn(),
			deselect: vi.fn(),
		};
		mocks.getOrAddTorrent.mockReturnValue(torrent);
		mocks.findVideoFile.mockReturnValue(videoFile);
		mocks.moveToLibrary.mockRejectedValue(new Error("disk failure"));
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const startPromise = startDownload("media-1", "magnet:?xt=urn:btih:hash-1");
		await vi.advanceTimersByTimeAsync(0);
		torrent.emit("ready");
		await startPromise;
		torrent.emit("done");
		await vi.advanceTimersByTimeAsync(0);

		expect(mocks.cleanupDownload).toHaveBeenCalledWith("hash-1", false);
		expect(mocks.downloadUpdateProgress).toHaveBeenCalledWith("download-1", 1, "error");
		consoleError.mockRestore();
	});

	it("cleans up a ready torrent after ten minutes without progress", async () => {
		const torrent = new FakeTorrent();
		const videoFile = {
			name: "Movie.mp4",
			path: "Movie.mp4",
			length: 100,
			downloaded: 0,
			progress: 0,
			select: vi.fn(),
			deselect: vi.fn(),
		};
		mocks.getOrAddTorrent.mockReturnValue(torrent);
		mocks.findVideoFile.mockReturnValue(videoFile);
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const startPromise = startDownload("media-1", "magnet:?xt=urn:btih:hash-1");
		await vi.advanceTimersByTimeAsync(0);
		torrent.emit("ready");
		await startPromise;
		await vi.advanceTimersByTimeAsync(600_000);

		const download = mocks.activeDownloads.get("hash-1");
		expect(download).toMatchObject({
			status: "error",
			error: "Download stalled for 10 minutes with no progress",
		});
		expect(mocks.downloadUpdateProgress).toHaveBeenCalledWith("download-1", 0, "error");
		expect(mocks.mediaUpdateProgress).toHaveBeenLastCalledWith("media-1", 0, "error");
		expect(mocks.cleanupDownload).toHaveBeenCalledOnce();
		expect(mocks.cleanupDownload).toHaveBeenCalledWith("hash-1", false);
		consoleError.mockRestore();
	});

	it("resets the stall limit when torrent bytes increase", async () => {
		const torrent = new FakeTorrent();
		const videoFile = {
			name: "Movie.mp4",
			path: "Movie.mp4",
			length: 100,
			downloaded: 0,
			progress: 0,
			select: vi.fn(),
			deselect: vi.fn(),
		};
		mocks.getOrAddTorrent.mockReturnValue(torrent);
		mocks.findVideoFile.mockReturnValue(videoFile);

		const startPromise = startDownload("media-1", "magnet:?xt=urn:btih:hash-1");
		await vi.advanceTimersByTimeAsync(0);
		torrent.emit("ready");
		await startPromise;

		await vi.advanceTimersByTimeAsync(595_000);
		torrent.downloaded = 1;
		await vi.advanceTimersByTimeAsync(5000);
		await vi.advanceTimersByTimeAsync(595_000);

		expect(mocks.cleanupDownload).not.toHaveBeenCalled();
	});
	it("averages finalization progress for concurrent downloads", () => {
		// Status aggregation reads only these live torrent counters.
		const torrent = {
			downloadSpeed: 0,
			uploadSpeed: 0,
			numPeers: 0,
		} as unknown as ActiveDownload["torrent"];
		const first: ActiveDownload = {
			mediaId: "media-1",
			infohash: "hash-1",
			mediaType: "movie",
			torrent,
			videoFile: null,
			videoFiles: [],
			subtitleFiles: [],
			selectedFileIndex: null,
			episodeMapping: new Map(),
			progress: 1,
			transcodeProgress: 0.25,
			status: "finalizing",
			activeStreams: 0,
			totalSize: 100,
		};
		const second: ActiveDownload = {
			...first,
			infohash: "hash-2",
			transcodeProgress: 0.75,
		};
		mocks.activeDownloads.set(first.infohash, first);
		mocks.activeDownloads.set(second.infohash, second);

		expect(getDownloadStatus("media-1")).toMatchObject({
			status: "finalizing",
			transcodeProgress: 0.5,
		});
	});
});
