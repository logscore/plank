import { describe, expect, it } from "vitest";
import { queryKeys } from "$lib/query-keys";

describe("Query Keys", () => {
	describe("Browse Keys", () => {
		it("should generate all keys", () => {
			expect(queryKeys.browse.all).toEqual(["browse"]);
		});

		it("should generate trending keys", () => {
			expect(queryKeys.browse.trending("all", 1)).toEqual(["browse", "trending", "all", 1]);
			expect(queryKeys.browse.trending("movie", 2)).toEqual(["browse", "trending", "movie", 2]);
		});

		it("should generate popular keys", () => {
			expect(queryKeys.browse.popular("show", 3)).toEqual(["browse", "popular", "show", 3]);
		});

		it("should generate infinite keys", () => {
			expect(queryKeys.browse.infinite("trending", "all")).toEqual(["browse", "infinite", "trending", "all"]);
		});

		it("should generate resolve keys", () => {
			expect(queryKeys.browse.resolve(123)).toEqual(["browse", "resolve", 123]);
		});

		it("should generate seasons keys", () => {
			expect(queryKeys.browse.seasons(123)).toEqual(["browse", "seasons", 123]);
		});
	});

	describe("Torrent Keys", () => {
		it("should generate all keys", () => {
			expect(queryKeys.torrents.all).toEqual(["torrents"]);
		});

		it("should generate search keys", () => {
			const params = { q: "test" };
			expect(queryKeys.torrents.search(params)).toEqual(["torrents", "search", params]);
		});

		it("should generate browse keys", () => {
			const params = { cat: "movies" };
			expect(queryKeys.torrents.browse("movies", params)).toEqual(["torrents", "browse", "movies", params]);
		});

		it("should generate cache keys", () => {
			expect(queryKeys.torrents.cache(["b", "a"])).toEqual(["torrents", "cache", ["a", "b"]]);
		});
	});

	describe("System Keys", () => {
		it("should generate all keys", () => {
			expect(queryKeys.system.all).toEqual(["system"]);
		});

		it("should generate prowlarr keys", () => {
			expect(queryKeys.system.prowlarr.status()).toEqual(["system", "prowlarr", "status"]);
			expect(queryKeys.system.prowlarr.test()).toEqual(["system", "prowlarr", "test"]);
		});
	});
});
