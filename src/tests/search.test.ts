import { describe, expect, it } from "vitest";
import {
	type CatalogSearchRequest,
	DEFAULT_CATALOG_FILTERS,
	getCatalogGenreIds,
	getCatalogGenreLabels,
	parseCatalogSearchParams,
	serializeCatalogSearch,
} from "$lib/data/search";

describe("catalog search parameters", () => {
	it("normalizes invalid and reversed filter values", () => {
		const params = new URLSearchParams([
			["q", `  ${"a".repeat(220)}  `],
			["scope", "invalid"],
			["media", "show"],
			["rating", "8.24"],
			["yearFrom", "2024"],
			["yearTo", "1999"],
			["genre", "comedy"],
			["genre", "invalid"],
			["genre", "comedy"],
			["sort", "newest"],
			["page", "2junk"],
		]);

		const request = parseCatalogSearchParams(params);

		expect(request.query).toHaveLength(200);
		expect(request.page).toBe(1);
		expect(request.filters).toEqual({
			genres: ["comedy"],
			media: "show",
			rating: 8,
			scope: "all",
			sort: "newest",
			yearFrom: 1999,
			yearTo: 2024,
		});
	});

	it("round-trips every supported filter", () => {
		const request: CatalogSearchRequest = {
			filters: {
				...DEFAULT_CATALOG_FILTERS,
				genres: ["science-fiction", "drama"],
				media: "movie",
				rating: 7.5,
				scope: "all",
				sort: "rating",
				yearFrom: 1990,
				yearTo: 2020,
			},
			page: 3,
			query: "Arrival",
		};

		expect(parseCatalogSearchParams(serializeCatalogSearch(request))).toEqual(request);
	});

	it("preserves an explicit catalog source", () => {
		const params = serializeCatalogSearch({
			filters: { ...DEFAULT_CATALOG_FILTERS, scope: "catalog" },
			page: 1,
			query: "",
		});

		expect(params.get("scope")).toBe("catalog");
		expect(parseCatalogSearchParams(params).filters.scope).toBe("catalog");
	});

	it("uses the current year when validating release dates", () => {
		const request = parseCatalogSearchParams(new URLSearchParams({ yearFrom: "2032" }), 2030);
		expect(request.filters.yearFrom).toBe(2032);
	});

	it("maps shared genres to TMDB ids and stored labels", () => {
		expect(getCatalogGenreIds(["action", "kids"], "movie")).toEqual([28]);
		expect(getCatalogGenreIds(["kids"], "movie")).toBeNull();
		expect(getCatalogGenreLabels(["science-fiction"])).toEqual(["Science Fiction", "Sci-Fi & Fantasy"]);
	});
});
