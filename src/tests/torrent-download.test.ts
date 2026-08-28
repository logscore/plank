import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	activeDownloads: new Map(),
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
	getOrAddTorrent: mocks.getOrAddTorrent,
	pendingDownloads: mocks.pendingDownloads,
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
		const { startDownload } = await import("../lib/server/torrent/download");

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
});
