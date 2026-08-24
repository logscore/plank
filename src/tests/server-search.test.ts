import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type CatalogSearchRequest,
	DEFAULT_CATALOG_FILTERS,
	fromCatalogSearchJson,
	toCatalogSearchJson,
} from "$lib/data/search";
import { mediaDb } from "$lib/server/db";
import { schema } from "$lib/server/db/schema";
import { searchCatalog } from "$lib/server/search";
import type { BrowseItem } from "$lib/server/tmdb";
import { db } from "./setup";

const { searchTmdbCatalogMock } = vi.hoisted(() => ({
	searchTmdbCatalogMock: vi.fn(),
}));

vi.mock("$lib/server/tmdb", () => ({
	searchTmdbCatalog: searchTmdbCatalogMock,
}));

const testUser = {
	id: "search-user",
	name: "Search User",
	email: "search@example.com",
	emailVerified: true,
};
const testOrg = {
	id: "search-org",
	name: "Search Org",
	slug: "search-org",
	createdAt: new Date(),
};

function createCatalogItem(overrides: Partial<BrowseItem>): BrowseItem {
	return {
		tmdbId: 0,
		imdbId: null,
		title: "Untitled",
		year: null,
		posterUrl: null,
		backdropUrl: null,
		overview: null,
		voteAverage: null,
		genres: [],
		mediaType: "movie",
		certification: null,
		needsResolve: true,
		...overrides,
	};
}

beforeEach(() => {
	db.insert(schema.user).values(testUser).run();
	db.insert(schema.organization).values(testOrg).run();
	searchTmdbCatalogMock.mockReset();
});

describe("unified search", () => {
	it("groups library and TMDB results without duplicate media", async () => {
		const savedMovie = mediaDb.create({
			userId: testUser.id,
			organizationId: testOrg.id,
			type: "movie",
			title: "Arrival",
			year: 2016,
			tmdbId: 329_865,
			imdbId: "tt2543164",
		});
		searchTmdbCatalogMock.mockResolvedValue({
			items: [
				createCatalogItem({
					tmdbId: 329_865,
					imdbId: "tt2543164",
					title: "Arrival",
					year: 2016,
				}),
				createCatalogItem({ tmdbId: 438_631, title: "Dune", year: 2021 }),
			],
			total: 2,
			page: 1,
			totalPages: 1,
		});
		const request: CatalogSearchRequest = {
			query: "",
			page: 1,
			filters: { ...DEFAULT_CATALOG_FILTERS, scope: "all" },
		};

		const response = await searchCatalog(testOrg.id, request);

		expect(response).toMatchObject({
			scope: "all",
			libraryItems: [{ id: savedMovie.id, title: "Arrival" }],
			catalogItems: [{ tmdbId: 438_631, title: "Dune" }],
			nextPage: null,
		});
		if (response.scope !== "all") {
			throw new Error("Expected an all-source response");
		}
		const jsonResponse = toCatalogSearchJson(response);
		if (jsonResponse.scope !== "all") {
			throw new Error("Expected an all-source JSON response");
		}
		expect(typeof jsonResponse.libraryItems[0]?.addedAt).toBe("string");
		const restored = fromCatalogSearchJson(jsonResponse);
		expect(restored.scope === "all" && restored.libraryItems[0]?.addedAt).toBeInstanceOf(Date);
	});
});
