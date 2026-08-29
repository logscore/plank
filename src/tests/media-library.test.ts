import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { addMediaFromMagnet } from "$lib/server/media-library";
import { startDownload } from "$lib/server/torrent/download";
import { db } from "./setup";

vi.mock("$lib/server/torrent/download", () => ({
	startDownload: vi.fn(),
}));

const testUser = {
	id: "adult-guard-user",
	name: "Adult Guard User",
	email: "adult-guard@example.com",
	emailVerified: true,
};
const testOrg = {
	id: "adult-guard-org",
	name: "Adult Guard Org",
	slug: "adult-guard-org",
	createdAt: new Date(),
};
const fetchMock = vi.fn();
global.fetch = fetchMock;

beforeEach(() => {
	db.insert(schema.user).values(testUser).run();
	db.insert(schema.organization).values(testOrg).run();
	fetchMock.mockReset();
	vi.mocked(startDownload).mockReset();
});

describe("media library adult-content guard", () => {
	it("rejects identified adult media before persistence or download", async () => {
		fetchMock.mockResolvedValue(
			Response.json({
				id: 123,
				title: "Blocked",
				adult: true,
			})
		);

		const result = addMediaFromMagnet(testUser.id, testOrg.id, {
			magnetLink: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Blocked.2024.1080p",
			type: "movie",
			tmdbId: 123,
			title: "Blocked",
			posterUrl: "https://image.example/poster.jpg",
		});

		await expect(result).rejects.toMatchObject({ status: 400 });
		expect(mediaDb.list(testOrg.id)).toEqual([]);
		expect(startDownload).not.toHaveBeenCalled();
	});
});
