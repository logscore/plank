import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaDb } from "../lib/server/db";
import { finalizeMediaToLibrary, transcodeLibrary } from "../lib/server/transcoder";

const file = vi.hoisted(() => ({ close: vi.fn(), sync: vi.fn() }));

vi.mock("node:fs/promises");
vi.mock("node:fs");
vi.mock("../lib/server/db", () => ({
	mediaDb: {
		getAll: vi.fn(),
		getById: vi.fn(),
		getEpisodesByParentId: vi.fn(),
		updateFileInfo: vi.fn(),
		updateFilePath: vi.fn(),
	},
}));

vi.mock("../lib/server/ffmpeg", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lib/server/ffmpeg")>();
	return {
		...actual,
		normalizeFileForPlayback: vi.fn(),
		probeFile: vi.fn(),
		requiresBrowserSafePlayback: vi.fn(),
	};
});

import { normalizeFileForPlayback, probeFile, requiresBrowserSafePlayback } from "../lib/server/ffmpeg";

describe("library transcoder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(existsSync).mockReturnValue(true);
		vi.mocked(probeFile).mockResolvedValue({
			audioChannels: 2,
			audioCodec: "aac",
			duration: 100,
			hasDataStreams: false,
			videoCodec: "h264",
		} as never);
		vi.mocked(normalizeFileForPlayback).mockResolvedValue(undefined);
		vi.mocked(requiresBrowserSafePlayback).mockResolvedValue(false);
		vi.mocked(fs.stat).mockResolvedValue({ size: 1000 } as never);
		vi.mocked(fs.unlink).mockResolvedValue(undefined);
		vi.mocked(fs.rename).mockResolvedValue(undefined);
		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.copyFile).mockResolvedValue(undefined);
		vi.mocked(fs.mkdtemp).mockResolvedValue("/local-temp/plank-finalize-test");
		vi.mocked(fs.rm).mockResolvedValue(undefined);
		vi.mocked(fs.open).mockResolvedValue(file as never);
		file.sync.mockResolvedValue(undefined);
		file.close.mockResolvedValue(undefined);
	});

	it("normalizes non-mp4 movies and episodes into mp4 files", async () => {
		const movie = { filePath: "/lib/movie.mkv", id: "movie-1", type: "movie" };
		const episode = { fileIndex: 0, filePath: "/lib/show/s01e01.mkv", id: "episode-1", type: "episode" };
		vi.mocked(mediaDb.getAll).mockReturnValue([movie, { filePath: null, id: "show-1", type: "show" }] as never);
		vi.mocked(mediaDb.getEpisodesByParentId).mockReturnValue([episode] as never);
		vi.mocked(mediaDb.getById).mockImplementation(((id: string) => {
			if (id === movie.id) {
				return movie;
			}
			if (id === episode.id) {
				return episode;
			}
		}) as never);

		await transcodeLibrary();

		expect(vi.mocked(normalizeFileForPlayback)).toHaveBeenCalledTimes(2);
		expect(vi.mocked(mediaDb.updateFilePath)).toHaveBeenCalledWith("movie-1", "/lib/movie.mp4", 1000);
		expect(vi.mocked(mediaDb.updateFileInfo)).toHaveBeenCalledWith("episode-1", {
			fileIndex: 0,
			filePath: "/lib/show/s01e01.mp4",
			fileSize: 1000,
		});
	});

	it("reports finalization progress until the file is ready", async () => {
		const onProgress = vi.fn();
		vi.mocked(normalizeFileForPlayback).mockImplementation(async (_source, _target, reportProgress) => {
			reportProgress?.(0.4);
		});

		await finalizeMediaToLibrary("/temp/pilot.mkv", "/library/pilot.mkv", onProgress);

		expect(fs.mkdtemp).toHaveBeenCalledWith(path.join(tmpdir(), "plank-finalize-"));
		expect(normalizeFileForPlayback).toHaveBeenCalledWith(
			"/temp/pilot.mkv",
			"/local-temp/plank-finalize-test/pilot.mp4",
			onProgress,
			undefined
		);
		expect(fs.copyFile).toHaveBeenCalledWith(
			"/local-temp/plank-finalize-test/pilot.mp4",
			"/library/pilot.finalizing.mp4"
		);
		expect(fs.rm).toHaveBeenCalledWith("/local-temp/plank-finalize-test", { force: true, recursive: true });
		expect(onProgress.mock.calls).toEqual([[0], [0.4], [1]]);
	});

	it("does not publish a file cancelled during the storage copy", async () => {
		const controller = new AbortController();
		vi.mocked(fs.copyFile).mockImplementationOnce(async () => controller.abort());
		await expect(
			finalizeMediaToLibrary("/temp/movie.mp4", "/library/movie.mp4", undefined, controller.signal)
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fs.rename).not.toHaveBeenCalled();
		expect(fs.unlink).toHaveBeenCalledWith("/library/movie.finalizing.mp4");
		expect(fs.rm).toHaveBeenCalledWith("/local-temp/plank-finalize-test", { force: true, recursive: true });
	});

	it("copies a ready download to the library before renaming it to the final filename", async () => {
		await finalizeMediaToLibrary("/temp/movie.mp4", "/library/movie.mp4");

		expect(fs.copyFile).toHaveBeenCalledWith("/temp/movie.mp4", "/library/movie.finalizing.mp4");
		expect(probeFile).toHaveBeenCalledWith("/temp/movie.mp4");
		expect(fs.rename).toHaveBeenCalledWith("/library/movie.finalizing.mp4", "/library/movie.mp4");
		expect(fs.copyFile).toHaveBeenCalledBefore(vi.mocked(fs.rename));
		expect(probeFile).toHaveBeenCalledBefore(vi.mocked(fs.rename));
		expect(fs.open).toHaveBeenCalledWith("/library/movie.mp4", "r+");
		expect(fs.rename).toHaveBeenCalledBefore(file.sync);
		expect(file.sync).toHaveBeenCalledOnce();
		expect(file.close).toHaveBeenCalledOnce();
		expect(normalizeFileForPlayback).not.toHaveBeenCalled();
	});

	it("does not report completion when finalization fails", async () => {
		vi.mocked(requiresBrowserSafePlayback).mockResolvedValue(true);
		const onProgress = vi.fn();

		await expect(finalizeMediaToLibrary("/temp/pilot.mkv", "/library/pilot.mkv", onProgress)).rejects.toThrow(
			"Finalized file is not browser-safe"
		);
		expect(onProgress.mock.calls).toEqual([[0]]);
		expect(vi.mocked(fs.rename)).not.toHaveBeenCalled();
		expect(vi.mocked(fs.copyFile)).not.toHaveBeenCalled();
	});

	it("keeps the source and does not publish a file when copying to storage fails", async () => {
		vi.mocked(fs.copyFile).mockRejectedValueOnce(new Error("Storage unavailable"));
		const onProgress = vi.fn();

		await expect(finalizeMediaToLibrary("/temp/movie.mp4", "/library/movie.mp4", onProgress)).rejects.toThrow(
			"Storage unavailable"
		);
		expect(fs.rename).not.toHaveBeenCalled();
		expect(fs.unlink).not.toHaveBeenCalledWith("/temp/movie.mp4");
		expect(onProgress.mock.calls).toEqual([[0]]);
	});

	it("does not report completion when storage cannot persist the final file", async () => {
		file.sync.mockRejectedValueOnce(new Error("Upload failed"));
		const onProgress = vi.fn();

		await expect(finalizeMediaToLibrary("/temp/movie.mp4", "/library/movie.mp4", onProgress)).rejects.toThrow(
			"Upload failed"
		);
		expect(file.close).toHaveBeenCalledOnce();
		expect(onProgress.mock.calls).toEqual([[0]]);
	});
});
