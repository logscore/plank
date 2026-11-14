import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/db", () => ({
	subtitlesDb: {
		getByMediaId: vi.fn(() => [
			{
				id: "legacy-subtitle",
				label: "English",
				language: "en",
				mediaId: "movie-1",
				source: "opensubtitles",
			},
		]),
	},
}));

import { getSubtitleTracksForMedia } from "$lib/server/subtitles";

describe("subtitle tracks", () => {
	it("does not expose saved defaults from older libraries", async () => {
		const tracks = await getSubtitleTracksForMedia({ filePath: null, id: "movie-1" });
		expect(tracks).toHaveLength(1);
		expect(tracks[0]).toMatchObject({ id: "legacy-subtitle", src: "/api/media/movie-1/subtitles/legacy-subtitle" });
	});
});
