import { beforeEach, describe, expect, it, vi } from "vitest";

const webTorrentMock = vi.hoisted(() => ({
	construct: vi.fn(),
	destroy: vi.fn((callback?: (error?: Error | null) => void) => callback?.()),
	on: vi.fn(),
}));

vi.mock("webtorrent", () => ({
	default: class MockWebTorrent {
		constructor(options: unknown) {
			webTorrentMock.construct(options);
		}

		on(event: string, callback: (error: Error) => void): void {
			webTorrentMock.on(event, callback);
		}

		destroy(callback?: (error?: Error | null) => void): void {
			webTorrentMock.destroy(callback);
		}
	},
}));

describe("WebTorrent client lifecycle", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		webTorrentMock.destroy.mockImplementation((callback) => callback?.());
	});

	it("creates one client for concurrent callers", async () => {
		const { getClient } = await import("../lib/server/torrent/client");

		const [first, second, third] = await Promise.all([getClient(), getClient(), getClient()]);

		expect(first).toBe(second);
		expect(second).toBe(third);
		expect(webTorrentMock.construct).toHaveBeenCalledTimes(1);
	});

	it.each([true, false])("awaits torrent lookup before reusing or adding a torrent (exists: %s)", async (exists) => {
		const { getOrAddTorrent } = await import("../lib/server/torrent/client");
		const torrent = { infoHash: "0123456789abcdef0123456789abcdef01234567" };
		const lookup = Promise.withResolvers<typeof torrent | null>();
		const client = { add: vi.fn(() => torrent), get: vi.fn(() => lookup.promise) };
		const magnet = `magnet:?xt=urn:btih:${torrent.infoHash}`;
		const result = getOrAddTorrent(client as never, magnet, "/temp/movie");
		expect(client.get).toHaveBeenCalledWith(magnet);
		expect(client.add).not.toHaveBeenCalled();
		lookup.resolve(exists ? torrent : null);
		expect(await result).toBe(torrent);
		if (exists) {
			expect(client.add).not.toHaveBeenCalled();
		} else {
			expect(client.add).toHaveBeenCalledWith(magnet, expect.objectContaining({ path: "/temp/movie" }));
		}
	});

	it("applies the peer and cache limits that keep memory bounded", async () => {
		const { getClient } = await import("../lib/server/torrent/client");

		await getClient();

		expect(webTorrentMock.construct).toHaveBeenCalledWith(
			expect.objectContaining({ downloadLimit: -1, maxConns: 55, uploadLimit: -1 })
		);
	});

	it("releases the client when the last download is cleaned up", async () => {
		const { activeDownloads, cleanupDownload, getClient } = await import("../lib/server/torrent/client");
		const client = await getClient();
		const torrent = { destroy: vi.fn((_opts: unknown, callback: () => void) => callback) };
		activeDownloads.set("hash-1", { abortController: new AbortController(), torrent } as never);
		activeDownloads.set("hash-2", { abortController: new AbortController(), torrent } as never);

		cleanupDownload("hash-1", false);
		await Promise.resolve();
		expect(webTorrentMock.destroy).not.toHaveBeenCalled();

		cleanupDownload("hash-2", false);
		await Promise.resolve();

		expect(webTorrentMock.destroy).toHaveBeenCalledTimes(1);
		expect(activeDownloads.size).toBe(0);
		// A later download must get a fresh client, not the destroyed one.
		await expect(getClient()).resolves.not.toBe(client);
	});

	it("destroys the client once and blocks new work during shutdown", async () => {
		const { getClient, pendingDownloads, shutdownTorrentClient } = await import("../lib/server/torrent/client");
		await getClient();
		pendingDownloads.set("pending", Promise.resolve());

		await Promise.all([shutdownTorrentClient(), shutdownTorrentClient()]);

		expect(webTorrentMock.destroy).toHaveBeenCalledTimes(1);
		expect(pendingDownloads.size).toBe(0);
		await expect(getClient()).rejects.toThrow("WebTorrent client is shutting down");
	});
});
