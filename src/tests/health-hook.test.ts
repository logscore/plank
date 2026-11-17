import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(),
	recoverDownloads: vi.fn(() => Promise.resolve()),
	resolve: vi.fn(() => Promise.resolve(new Response("ok"))),
}));

vi.mock("$lib/server/auth", () => ({
	auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("$lib/server/cron-jobs", () => ({
	tempFolderCleanupJob: vi.fn(() => ({ destroy: vi.fn() })),
}));
vi.mock("$lib/server/db/index", () => ({ db: {} }));
vi.mock("$lib/server/db/schema", () => ({ schema: {} }));
vi.mock("$lib/server/torrent/client", () => ({ shutdownTorrentClient: vi.fn() }));
vi.mock("$lib/server/torrent/recovery", () => ({ recoverDownloads: mocks.recoverDownloads }));

import { handle } from "../hooks.server";

describe("health request hook", () => {
	it("bypasses session and database work", async () => {
		const response = await handle({
			event: {
				url: new URL("http://localhost/health"),
				request: new Request("http://localhost/health"),
				locals: {},
			},
			resolve: mocks.resolve,
		} as never);

		expect(response.status).toBe(200);
		expect(mocks.resolve).toHaveBeenCalledTimes(1);
		expect(mocks.getSession).not.toHaveBeenCalled();
	});
});
