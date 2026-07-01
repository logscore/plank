import fs from "node:fs/promises";
import path from "node:path";
import { Jimp, JimpMime } from "jimp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteImage, MAX_FILE_SIZE, replaceImage, saveImage, savePosterBackdropImages } from "$lib/server/images";

const DATA = "/mock/data";

vi.mock("node:fs/promises", () => ({
	default: {
		access: vi.fn(),
		mkdir: vi.fn(),
		writeFile: vi.fn(),
		unlink: vi.fn(),
		stat: vi.fn(),
		readFile: vi.fn(),
	},
}));

// --- fixtures / helpers -----------------------------------------------------

/** Build a real, decodable image buffer of known dimensions/format. */
async function makeImage(width: number, height: number, mime: string = JimpMime.png): Promise<Buffer> {
	const img = new Jimp({ width, height, color: 0xff_00_00_ff });
	return img.getBuffer(mime as Parameters<typeof img.getBuffer>[0]);
}

async function makeImageArrayBuffer(width: number, height: number, mime: string = JimpMime.png): Promise<ArrayBuffer> {
	const buf = await makeImage(width, height, mime);
	return Uint8Array.from(buf).buffer;
}

/** The buffer handed to the most recent fs.writeFile call. */
function lastWritten(): Buffer {
	const calls = vi.mocked(fs.writeFile).mock.calls;
	if (calls.length === 0) {
		throw new Error("fs.writeFile was never called");
	}
	return calls.at(-1)?.[1] as Buffer;
}

async function dimsOf(buf: Buffer): Promise<{ width: number; height: number }> {
	const img = await Jimp.read(buf);
	return { width: img.width, height: img.height };
}

const isJpeg = (b: Buffer): boolean => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

beforeEach(() => {
	// Reset implementations AND call history (mockReset clears the once-queue too).
	vi.mocked(fs.access).mockReset().mockResolvedValue(undefined); // dir exists by default
	vi.mocked(fs.mkdir).mockReset().mockResolvedValue(undefined);
	vi.mocked(fs.writeFile).mockReset().mockResolvedValue(undefined);
	vi.mocked(fs.unlink).mockReset().mockResolvedValue(undefined);
	vi.mocked(fs.stat).mockReset();
	vi.mocked(fs.readFile).mockReset();
	global.fetch = vi.fn();
});

describe("saveImage", () => {
	it("writes a processed JPEG to the correct path and returns the data-relative path", async () => {
		const png = await makeImage(100, 200);

		const returned = await saveImage("library", "123", "poster.jpg", png);

		expect(returned).toBe("library/123/poster.jpg");
		expect(fs.writeFile).toHaveBeenCalledTimes(1);
		expect(fs.writeFile).toHaveBeenCalledWith(path.join(DATA, "library/123/poster.jpg"), expect.any(Buffer));
		expect(isJpeg(lastWritten())).toBe(true);
	});

	it("always re-encodes output to JPEG, even for PNG input", async () => {
		await saveImage("library", "id", "image.jpg", await makeImage(64, 64, JimpMime.png));
		expect(isJpeg(lastWritten())).toBe(true);
	});

	it("converts GIF input to JPEG output", async () => {
		await saveImage("library", "id", "image.jpg", await makeImage(64, 64, JimpMime.gif));
		expect(isJpeg(lastWritten())).toBe(true);
	});

	it.each([
		"library",
		"posters",
		"backdrops",
		"series",
	])("does NOT resize category '%s' (preserves original dimensions)", async (category) => {
		await saveImage(category, "id", "image.jpg", await makeImage(100, 200));
		expect(await dimsOf(lastWritten())).toEqual({ width: 100, height: 200 });
	});

	it.each(["logos", "avatars"])("resizes category '%s' to 512x512 (cover)", async (category) => {
		// Non-square input to prove cover crops to an exact square.
		await saveImage(category, "id", "image.jpg", await makeImage(300, 100));
		expect(await dimsOf(lastWritten())).toEqual({ width: 512, height: 512 });
	});

	it("accepts an ArrayBuffer and converts it to a Buffer", async () => {
		const ab = await makeImageArrayBuffer(120, 120);

		const returned = await saveImage("library", "ab", "image.jpg", ab);

		expect(returned).toBe("library/ab/image.jpg");
		expect(isJpeg(lastWritten())).toBe(true);
	});

	it("creates the directory when it does not exist", async () => {
		vi.mocked(fs.access).mockRejectedValueOnce(new Error("ENOENT"));

		await saveImage("library", "123", "poster.jpg", await makeImage(10, 10));

		expect(fs.mkdir).toHaveBeenCalledWith(path.join(DATA, "library/123"), { recursive: true });
	});

	it("does NOT create the directory when it already exists", async () => {
		vi.mocked(fs.access).mockResolvedValue(undefined);

		await saveImage("library", "123", "poster.jpg", await makeImage(10, 10));

		expect(fs.mkdir).not.toHaveBeenCalled();
	});

	it("rejects non-image data before writing anything", async () => {
		const notAnImage = Buffer.from("definitely not an image payload");

		await expect(saveImage("library", "x", "x.jpg", notAnImage)).rejects.toThrow(/Invalid image format/);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("rejects files larger than MAX_FILE_SIZE before writing anything", async () => {
		const tooBig = Buffer.alloc(MAX_FILE_SIZE + 1);

		await expect(saveImage("library", "x", "x.jpg", tooBig)).rejects.toThrow(/exceeds 10MB/);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("rejects data with a valid magic number but corrupt body (Jimp cannot decode)", async () => {
		// Correct PNG signature, garbage payload -> passes validation, fails Jimp.read.
		const corrupt = Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			Buffer.from("not a real png body"),
		]);

		await expect(saveImage("library", "x", "x.jpg", corrupt)).rejects.toThrow();
		expect(fs.writeFile).not.toHaveBeenCalled();
	});
});

describe("deleteImage", () => {
	it("unlinks the resolved absolute path", async () => {
		await deleteImage("library/123/poster.jpg");
		expect(fs.unlink).toHaveBeenCalledWith(path.join(DATA, "library/123/poster.jpg"));
	});

	it("swallows errors when the file is missing", async () => {
		vi.mocked(fs.unlink).mockRejectedValue(new Error("ENOENT"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await expect(deleteImage("library/123/missing.jpg")).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();

		warn.mockRestore();
	});
});

describe("replaceImage", () => {
	it("rejects an invalid image without writing or deleting", async () => {
		const result = await replaceImage(null, Buffer.from("nope"), "image/png", "avatars", "u1");

		expect(result).toEqual({ error: expect.stringMatching(/Invalid image format/) });
		expect(fs.writeFile).not.toHaveBeenCalled();
		expect(fs.unlink).not.toHaveBeenCalled();
	});

	it("rejects a declared mime type that is not allowed", async () => {
		const png = await makeImage(50, 50);

		const result = await replaceImage(null, png, "image/webp", "avatars", "u1");

		expect(result).toEqual({ error: "Invalid image type" });
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("saves a new avatar (resized to 512x512) and returns the image path", async () => {
		const png = await makeImage(300, 100);

		const result = await replaceImage(null, png, "image/png", "avatars", "u1");

		// Stored under data/avatars/u1/image.jpg
		expect(fs.writeFile).toHaveBeenCalledWith(path.join(DATA, "avatars/u1/image.jpg"), expect.any(Buffer));
		expect(await dimsOf(lastWritten())).toEqual({ width: 512, height: 512 });
		expect(result).toEqual({ imagePath: "/images/avatars/u1/image.jpg" });
		expect(fs.unlink).not.toHaveBeenCalled();
	});

	it("deletes the previous image (stripping the /images/ prefix) when replacing", async () => {
		const png = await makeImage(40, 40);

		await replaceImage("/images/avatars/u1/old.jpg", png, "image/png", "avatars", "u1");

		expect(fs.unlink).toHaveBeenCalledWith(path.join(DATA, "avatars/u1/old.jpg"));
	});

	it("returns a processing error when a valid-magic image cannot be decoded", async () => {
		const corrupt = Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			Buffer.from("garbage"),
		]);

		const result = await replaceImage(null, corrupt, "image/png", "logos", "org1");

		expect(result).toEqual({ error: "Failed to process image. Allowed: JPEG, PNG, GIF" });
	});
});

describe("saveTmdbImages", () => {
	it("saves both poster and backdrop and returns prefixed urls", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => await makeImageArrayBuffer(80, 120) })
			.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => await makeImageArrayBuffer(120, 80) });

		const result = await savePosterBackdropImages(
			{ posterUrl: "http://tmdb/poster.jpg", backdropUrl: "http://tmdb/backdrop.jpg" },
			"library",
			"1"
		);

		expect(global.fetch).toHaveBeenCalledTimes(2);
		// Each downloaded image is processed and stored under data/<category>/...
		expect(fs.writeFile).toHaveBeenCalledWith(path.join(DATA, "library/1/poster.jpg"), expect.any(Buffer));
		expect(fs.writeFile).toHaveBeenCalledWith(path.join(DATA, "library/1/backdrop.jpg"), expect.any(Buffer));
		expect(result.posterUrl).toBe("/images/library/1/poster.jpg");
		expect(result.backdropUrl).toBe("/images/library/1/backdrop.jpg");
	});

	it("keeps the original url and logs when downloaded content is not a valid image", async () => {
		const notImage = Uint8Array.from(Buffer.from("<html>error</html>")).buffer;
		global.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => notImage });
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await savePosterBackdropImages(
			{ posterUrl: "http://tmdb/poster.jpg", backdropUrl: null },
			"library",
			"1"
		);

		expect(result.posterUrl).toBe("http://tmdb/poster.jpg"); // unchanged
		expect(errorSpy).toHaveBeenCalled();
		expect(fs.writeFile).not.toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("only fetches the poster when backdrop is null", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue({ ok: true, arrayBuffer: async () => await makeImageArrayBuffer(80, 120) });

		const result = await savePosterBackdropImages(
			{ posterUrl: "http://tmdb/poster.jpg", backdropUrl: null },
			"library",
			"1"
		);

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(result.posterUrl).toBe("/images/library/1/poster.jpg");
		expect(result.backdropUrl).toBeNull();
	});

	it("returns the original url and logs when a save fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, statusText: "Not Found" });
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await savePosterBackdropImages(
			{ posterUrl: "http://tmdb/poster.jpg", backdropUrl: null },
			"library",
			"1"
		);

		expect(result.posterUrl).toBe("http://tmdb/poster.jpg"); // unchanged
		expect(errorSpy).toHaveBeenCalled();
		expect(fs.writeFile).not.toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("handles a partial failure (poster ok, backdrop fails) independently", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => await makeImageArrayBuffer(80, 120) })
			.mockResolvedValueOnce({ ok: false, statusText: "Server Error" });
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await savePosterBackdropImages(
			{ posterUrl: "http://tmdb/poster.jpg", backdropUrl: "http://tmdb/backdrop.jpg" },
			"library",
			"1"
		);

		expect(result.posterUrl).toBe("/images/library/1/poster.jpg");
		expect(result.backdropUrl).toBe("http://tmdb/backdrop.jpg"); // unchanged on failure
		expect(errorSpy).toHaveBeenCalledTimes(1);

		errorSpy.mockRestore();
	});

	it("does nothing and returns nulls when both urls are null", async () => {
		const result = await savePosterBackdropImages({ posterUrl: null, backdropUrl: null }, "library", "1");

		expect(result).toEqual({ posterUrl: null, backdropUrl: null });
		expect(global.fetch).not.toHaveBeenCalled();
	});
});
