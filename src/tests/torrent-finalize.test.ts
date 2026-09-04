import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveDownload, TorrentFile } from "../lib/server/torrent/client";
import { moveToLibrary } from "../lib/server/torrent/finalize";

const mocks = vi.hoisted(() => ({
	copyFile: vi.fn(),
	discoverSubtitles: vi.fn(async () => undefined),
	finalizeMediaToLibrary: vi.fn(),
	getEpisodeByParentAndNumber: vi.fn(),
	getEpisodeBySeasonAndNumber: vi.fn(),
	mediaGetById: vi.fn(),
	mkdir: vi.fn(),
	updateEpisodeFileInfo: vi.fn(),
	updateEpisodeProgress: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	default: {
		copyFile: mocks.copyFile,
		mkdir: mocks.mkdir,
	},
}));

vi.mock("../lib/server/db", () => ({
	mediaDb: {
		create: vi.fn(),
		getById: mocks.mediaGetById,
		getEpisodeByParentAndNumber: mocks.getEpisodeByParentAndNumber,
		getEpisodeBySeasonAndNumber: mocks.getEpisodeBySeasonAndNumber,
		updateEpisodeProgress: mocks.updateEpisodeProgress,
		updateFileInfo: mocks.updateEpisodeFileInfo,
		updateFilePath: vi.fn(),
	},
	seasonsDb: {
		create: vi.fn(),
		getByMediaAndNumber: vi.fn(() => ({ id: "season-1" })),
		getByMediaId: vi.fn(() => [{ id: "season-1" }]),
		updateEpisodeCount: vi.fn(),
	},
}));

vi.mock("../lib/server/images", () => ({
	sanitizeFilename: (value: string) => value,
}));

vi.mock("../lib/server/paths", () => ({
	buildMovieFileName: vi.fn(),
	getEpisodeLibraryPath: (_show: unknown, episode: { id: string }) => `/library/show/${episode.id}.mp4`,
	getMovieLibraryRoot: vi.fn(),
	getSeasonLibraryDirectory: vi.fn(),
	getShowLibraryRoot: () => "/library/show",
	PATHS: { library: "/library", temp: "/temp" },
}));

vi.mock("../lib/server/subtitles", () => ({
	discoverSubtitles: mocks.discoverSubtitles,
}));

vi.mock("../lib/server/transcoder", () => ({
	finalizeMediaToLibrary: mocks.finalizeMediaToLibrary,
}));

function createVideoFile(name: string): TorrentFile {
	return {
		name,
		path: name,
		length: 100,
		downloaded: 100,
		progress: 1,
		select: vi.fn(),
		deselect: vi.fn(),
		createReadStream: () => new PassThrough(),
	};
}

describe("torrent library finalization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mediaGetById.mockReturnValue({ id: "show-1", type: "show" });
		mocks.getEpisodeByParentAndNumber.mockImplementation(
			(_mediaId: string, _seasonNumber: number, episodeNumber: number) => ({ id: `episode-${episodeNumber}` })
		);
		mocks.getEpisodeBySeasonAndNumber.mockImplementation((_seasonId: string, episodeNumber: number) => ({
			id: `episode-${episodeNumber}`,
		}));
	});

	it("reports total progress across all show files", async () => {
		const videoFiles = [createVideoFile("episode-1.mkv"), createVideoFile("episode-2.mkv")];
		const progress: number[] = [];
		// Finalization only reads the torrent path and live counters from this boundary object.
		const torrent = {
			path: "/temp/show-1/hash-1",
			downloadSpeed: 0,
			uploadSpeed: 0,
			numPeers: 0,
		} as unknown as ActiveDownload["torrent"];
		const download: ActiveDownload = {
			mediaId: "show-1",
			infohash: "hash-1",
			mediaType: "show",
			torrent,
			videoFile: null,
			videoFiles,
			subtitleFiles: [],
			selectedFileIndex: null,
			episodeMapping: new Map([
				[101, 0],
				[102, 1],
			]),
			progress: 1,
			transcodeProgress: 0,
			status: "finalizing",
			activeStreams: 0,
			totalSize: 200,
		};
		mocks.finalizeMediaToLibrary.mockImplementation(
			async (_sourcePath: string, targetPath: string, reportProgress?: (value: number) => void) => {
				reportProgress?.(0.5);
				progress.push(download.transcodeProgress);
				reportProgress?.(1);
				progress.push(download.transcodeProgress);
				return { filePath: targetPath, fileSize: 100 };
			}
		);

		await moveToLibrary("show-1", download);

		expect(progress).toEqual([0.25, 0.5, 0.75, 1]);
		expect(download.transcodeProgress).toBe(1);
	});
});
