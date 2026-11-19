import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { type AddMediaFromMagnetParams, addMediaFromMagnet } from "$lib/server/media-library";
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

	it("stores the TMDB rating, not the rating the client sent", async () => {
		vi.mocked(startDownload).mockResolvedValue(undefined as never);
		fetchMock.mockImplementation(async () =>
			Response.json({
				id: 124,
				title: "Alien",
				release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ type: 3, certification: "R" }] }] },
			})
		);
		// A crafted request still sends a rating, so the test keeps the field the type no longer has.
		const params = {
			magnetLink: "magnet:?xt=urn:btih:1123456789abcdef0123456789abcdef01234567&dn=Alien.1979.1080p",
			type: "movie",
			tmdbId: 124,
			title: "Alien",
			overview: "In space no one can hear you scream.",
			certification: "G",
		} as AddMediaFromMagnetParams;

		const { body } = await addMediaFromMagnet(testUser.id, testOrg.id, params);

		expect(body.certification).toBe("R");
	});
});
