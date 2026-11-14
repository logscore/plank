import { execFileSync } from "node:child_process";
import { randomFillSync } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { eq } from "drizzle-orm";
import { Jimp, JimpMime } from "jimp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadsDb, mediaDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { probeFile } from "$lib/server/ffmpeg";
import { appendUploadChunk } from "$lib/server/media-upload";
import { PATHS } from "$lib/server/paths";
import { cancelDownload } from "$lib/server/torrent/download";
import { UPLOAD_CHUNK_BYTES } from "$lib/utils";
import { PUT as putAvatar } from "../routes/api/upload/avatar/+server";
import { db } from "./setup";

vi.mock("$lib/server/torrent/download", () => ({ cancelDownload: vi.fn(), startDownload: vi.fn() }));

let workDir = "";
let videoBytes = new Uint8Array();

beforeEach(async () => {
	db.insert(schema.user).values({ email: "u@example.com", emailVerified: true, id: "user-1", name: "U" }).run();
	db.insert(schema.organization).values({ createdAt: new Date(), id: "org-1", name: "O", slug: "o" }).run();
	workDir = await fs.mkdtemp(path.join(tmpdir(), "plank-upload-test-"));
	PATHS.data = workDir;
	vi.spyOn(PATHS, "temp", "get").mockReturnValue(path.join(workDir, "temp"));
	// A real two second mkv, so finalize runs a real ffmpeg transmux to mp4.
	const sourcePath = path.join(workDir, "source.mkv");
	execFileSync(ffmpegInstaller.path, [
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"testsrc=duration=2:size=160x120:rate=10",
		"-f",
		"lavfi",
		"-i",
		"sine=duration=2",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		sourcePath,
	]);
	videoBytes = new Uint8Array(await fs.readFile(sourcePath));
});

afterEach(async () => {
	await fs.rm(workDir, { force: true, recursive: true });
	vi.restoreAllMocks();
});

describe("appendUploadChunk", () => {
	it("ignores chunks at the wrong offset and moves the finished upload into the library", async () => {
		const movie = mediaDb.create({
			infohash: "old-infohash",
			magnetLink: "magnet:?xt=urn:btih:old-infohash",
			organizationId: "org-1",
			title: "Upload Test",
			type: "movie",
			userId: "user-1",
			year: 2020,
		});
		downloadsDb.create({ infohash: "old-infohash", magnetLink: movie.magnetLink ?? "", mediaId: movie.id });
		const size = videoBytes.length;
		const half = Math.floor(size / 2);
		const tempDir = path.join(PATHS.temp, movie.id);

		expect(await appendUploadChunk(movie.id, ".mkv", size, 0, videoBytes.subarray(0, half))).toBe(half);
		expect(cancelDownload).toHaveBeenCalledWith(movie.id);
		expect(downloadsDb.getByMediaId(movie.id)).toEqual([]);
		expect(mediaDb.getById(movie.id)).toMatchObject({ infohash: null, magnetLink: null });
		// A resent first half must not be written twice.
		expect(await appendUploadChunk(movie.id, ".mkv", size, 1, videoBytes.subarray(0, half))).toBe(half);
		expect(existsSync(path.join(tempDir, "upload.mkv.part"))).toBe(true);
		expect(mediaDb.getById(movie.id)?.status).toBe("downloading");

		expect(await appendUploadChunk(movie.id, ".mkv", size, half, videoBytes.subarray(half))).toBe(size);

		await vi.waitFor(() => expect(mediaDb.getById(movie.id)?.status).toBe("complete"), { timeout: 20_000 });
		const finished = mediaDb.getById(movie.id);
		expect(finished?.filePath).toBe(path.join(workDir, "library", "Upload Test (2020)", "Upload Test (2020).mp4"));
		expect((await probeFile(finished?.filePath ?? "")).duration).toBeGreaterThan(1);
		expect(existsSync(tempDir)).toBe(false);
	}, 30_000);

	it("reports invalid videos without replacing an existing library file", async () => {
		const filePath = path.join(workDir, "source.mkv");
		const movie = mediaDb.create({
			filePath,
			fileSize: videoBytes.length,
			organizationId: "org-1",
			status: "complete",
			title: "Existing Movie",
			type: "movie",
			userId: "user-1",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const invalidVideo = new Uint8Array([0, 1, 2, 3]);

		await expect(appendUploadChunk(movie.id, ".mkv", invalidVideo.length, 0, invalidVideo)).rejects.toMatchObject({
			status: 500,
		});

		expect(mediaDb.getById(movie.id)).toMatchObject({ filePath, status: "error" });
		expect(new Uint8Array(await fs.readFile(filePath))).toEqual(videoBytes);
	});
});

describe("avatar upload", () => {
	it("joins chunks no larger than the default body limit into one image", async () => {
		// Random pixels do not compress, so the PNG needs more than one chunk.
		const image = new Jimp({ color: 0x00_00_00_ff, height: 600, width: 600 });
		randomFillSync(image.bitmap.data);
		const png = new Uint8Array(await image.getBuffer(JimpMime.png));
		expect(png.length).toBeGreaterThan(UPLOAD_CHUNK_BYTES * 2);

		let received = 0;
		let body: { image?: string; received: number; success?: boolean } = { received: 0 };
		const requestCountMax = Math.ceil(png.length / UPLOAD_CHUNK_BYTES);
		for (let requestCount = 0; requestCount < requestCountMax; requestCount += 1) {
			const url = new URL(`http://localhost/api/upload/avatar?offset=${received}&size=${png.length}`);
			const chunk = png.subarray(received, received + UPLOAD_CHUNK_BYTES);
			expect(chunk.length).toBeLessThanOrEqual(512 * 1024);
			const request = new Request(url, { body: chunk, method: "PUT" });
			// biome-ignore lint/performance/noAwaitInLoops: chunks must arrive in order
			const response = await putAvatar({ locals: { user: { id: "user-1" } }, request, url } as never);
			body = await response.json();
			({ received } = body);
		}

		expect(received).toBe(png.length);
		expect(body.success).toBe(true);
		const user = db.select().from(schema.user).where(eq(schema.user.id, "user-1")).get();
		expect(user?.image).toBe(body.image);
		expect(existsSync(path.join(PATHS.temp, "uploads", "avatar-user-1.part"))).toBe(false);
	});
});
