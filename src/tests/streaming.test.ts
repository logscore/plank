import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireMediaAccess } = vi.hoisted(() => ({
	requireMediaAccess: vi.fn(),
}));

vi.mock("$lib/server/api-guard", () => ({
	requireMediaAccess,
}));

vi.mock("$lib/server/torrent/download", () => ({
	startDownload: vi.fn(),
}));

vi.mock("$lib/server/torrent/status", () => ({
	getDownloadStatus: vi.fn(),
	isDownloadActive: vi.fn(),
	waitForVideoReady: vi.fn(),
}));

vi.mock("$lib/server/torrent/stream", () => ({
	getVideoStream: vi.fn(),
}));

vi.mock("$lib/server/ffmpeg", () => ({
	createTransmuxStream: vi.fn((value) => value.inputStream),
	needsTransmux: vi.fn(() => false),
	requiresBrowserSafePlayback: vi.fn(() => Promise.resolve(false)),
}));

import * as ffmpeg from "$lib/server/ffmpeg";
import * as torrentStatus from "$lib/server/torrent/status";
import * as torrentStream from "$lib/server/torrent/stream";
import { GET } from "../routes/api/media/[id]/stream/+server";

describe("streaming route behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 404 when torrent streaming cannot resolve a file", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: {
				id: "episode-1",
				type: "episode",
				filePath: null,
				fileIndex: 0,
				magnetLink: "magnet:?xt=urn:btih:episode123",
				status: "downloading",
			},
		});
		vi.mocked(torrentStatus.waitForVideoReady).mockResolvedValue(true);
		vi.mocked(torrentStream.getVideoStream).mockResolvedValue(null);

		await expect(
			GET({
				params: { id: "episode-1" },
				locals: {} as App.Locals,
				request: new Request("http://localhost"),
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it("serves torrent streams when media is ready", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: {
				id: "episode-1",
				type: "episode",
				filePath: null,
				fileIndex: 0,
				magnetLink: "magnet:?xt=urn:btih:episode123",
				status: "downloading",
			},
		});
		vi.mocked(torrentStatus.waitForVideoReady).mockResolvedValue(true);
		vi.mocked(torrentStream.getVideoStream).mockResolvedValue({
			stream: Readable.from(["video"]),
			fileSize: 5,
			fileName: "pilot.mp4",
			mimeType: "video/mp4",
			isComplete: false,
		});

		const response = await GET({
			params: { id: "episode-1" },
			locals: {} as App.Locals,
			request: new Request("http://localhost"),
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(vi.mocked(torrentStream.getVideoStream)).toHaveBeenCalledWith("episode-1");
	});

	it("rejects completed torrent streams without a finalized library file", async () => {
		requireMediaAccess.mockReturnValue({
			mediaItem: {
				id: "episode-1",
				type: "episode",
				filePath: null,
				fileIndex: 0,
				magnetLink: "magnet:?xt=urn:btih:episode123",
				status: "downloading",
			},
		});
		vi.mocked(torrentStatus.waitForVideoReady).mockResolvedValue(true);
		vi.mocked(torrentStream.getVideoStream).mockResolvedValue({
			stream: Readable.from(["video"]),
			fileSize: 5,
			fileName: "pilot.mp4",
			mimeType: "video/mp4",
			isComplete: true,
		});

		await expect(
			GET({
				params: { id: "episode-1" },
				locals: {} as App.Locals,
				request: new Request("http://localhost"),
			} as never)
		).rejects.toMatchObject({ status: 503 });
		expect(vi.mocked(ffmpeg.createTransmuxStream)).not.toHaveBeenCalled();
	});
});
