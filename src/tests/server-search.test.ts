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
	email: "search@example.com",
	emailVerified: true,
	id: "search-user",
	name: "Search User",
};
const testOrg = {
	createdAt: new Date(),
	id: "search-org",
	name: "Search Org",
	slug: "search-org",
};

function createCatalogItem(overrides: Partial<BrowseItem>): BrowseItem {
	return {
		backdropUrl: null,
		certification: null,
		genres: [],
		imdbId: null,
		mediaType: "movie",
		needsResolve: true,
		overview: null,
		posterUrl: null,
		title: "Untitled",
		tmdbId: 0,
		voteAverage: null,
		year: null,
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
			imdbId: "tt2543164",
			organizationId: testOrg.id,
			title: "Arrival",
			tmdbId: 329_865,
			type: "movie",
			userId: testUser.id,
			year: 2016,
		});
		searchTmdbCatalogMock.mockResolvedValue({
			items: [
				createCatalogItem({
					imdbId: "tt2543164",
					title: "Arrival",
					tmdbId: 329_865,
					year: 2016,
				}),
				createCatalogItem({ title: "Dune", tmdbId: 438_631, year: 2021 }),
			],
			page: 1,
			totalPages: 1,
		});
		const request: CatalogSearchRequest = {
			filters: { ...DEFAULT_CATALOG_FILTERS, scope: "all" },
			page: 1,
			query: "",
		};

		const response = await searchCatalog(testOrg.id, request);

		expect(response).toMatchObject({
			catalogItems: [{ title: "Dune", tmdbId: 438_631 }],
			libraryItems: [{ id: savedMovie.id, title: "Arrival" }],
			nextPage: null,
			scope: "all",
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
