import { describe, expect, it } from "vitest";
import { getCaptionSelection, setCaptionSelection } from "$lib/caption-session.svelte";

describe("caption session", () => {
	it("starts without a selected track", () => {
		expect(getCaptionSelection("unselected-movie")).toBeUndefined();
	});

	it("remembers the selected track while captions are off", () => {
		setCaptionSelection("movie-1", "spanish", true);
		setCaptionSelection("movie-1", "spanish", false);
		expect(getCaptionSelection("movie-1")).toEqual({ trackId: "spanish", enabled: false });

		const trackId = getCaptionSelection("movie-1")?.trackId ?? null;
		setCaptionSelection("movie-1", trackId, true);
		expect(getCaptionSelection("movie-1")).toEqual({ trackId: "spanish", enabled: true });
	});

	it("keeps episode choices separate and disables captions when a selected track is removed", () => {
		setCaptionSelection("episode-1", "english", true);
		setCaptionSelection("episode-2", "french", true);
		setCaptionSelection("episode-1", null, true);
		expect(getCaptionSelection("episode-1")).toEqual({ trackId: null, enabled: false });
		expect(getCaptionSelection("episode-2")).toEqual({ trackId: "french", enabled: true });
	});
});
