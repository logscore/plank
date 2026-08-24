import type { CatalogSearchRequest, CatalogSearchResponse } from "$lib/data/search";
import { mediaDb, seasonsDb } from "$lib/server/db";
import type { BrowseItem } from "$lib/server/tmdb";
import { searchTmdbCatalog } from "$lib/server/tmdb";
import type { Media } from "$lib/types";

const LIBRARY_PAGE_SIZE = 20;

type LibraryResponse = Extract<CatalogSearchResponse, { scope: "library" }>;

function searchLibrary(organizationId: string, request: CatalogSearchRequest): LibraryResponse {
	const offset = (request.page - 1) * LIBRARY_PAGE_SIZE;
	const pageItems = mediaDb.search(organizationId, request.query, request.filters, LIBRARY_PAGE_SIZE + 1, offset);
	const hasNextPage = pageItems.length > LIBRARY_PAGE_SIZE;
	const items = pageItems.slice(0, LIBRARY_PAGE_SIZE);
	const seasonsByMediaId = Object.fromEntries(
		items.filter((item) => item.type === "show").map((item) => [item.id, seasonsDb.getWithEpisodes(item.id)])
	);
	return {
		scope: "library",
		items,
		seasonsByMediaId,
		nextPage: hasNextPage ? request.page + 1 : null,
	};
}

function addLibraryIdentityKeys(
	keys: Set<string>,
	item: Pick<Media, "type" | "title" | "year" | "tmdbId" | "imdbId">
): void {
	if (item.type !== "movie" && item.type !== "show") {
		return;
	}
	if (item.tmdbId !== null) {
		keys.add(`tmdb:${item.type}:${item.tmdbId}`);
	}
	if (item.imdbId) {
		keys.add(`imdb:${item.imdbId}`);
	}
	keys.add(`title:${item.type}:${item.title.trim().toLowerCase()}:${item.year ?? "unknown"}`);
}

function isInLibrary(keys: Set<string>, item: BrowseItem): boolean {
	if (keys.has(`tmdb:${item.mediaType}:${item.tmdbId}`)) {
		return true;
	}
	if (item.imdbId && keys.has(`imdb:${item.imdbId}`)) {
		return true;
	}
	return keys.has(`title:${item.mediaType}:${item.title.trim().toLowerCase()}:${item.year ?? "unknown"}`);
}

export async function searchCatalog(
	organizationId: string,
	request: CatalogSearchRequest
): Promise<CatalogSearchResponse> {
	if (request.filters.scope === "catalog") {
		const result = await searchTmdbCatalog(request);
		return {
			scope: "catalog",
			items: result.items,
			nextPage: result.totalPages > request.page ? request.page + 1 : null,
		};
	}

	const library = searchLibrary(organizationId, request);
	if (request.filters.scope === "library") {
		return library;
	}

	const catalogPromise = searchTmdbCatalog(request);
	const identities = mediaDb.searchIdentities(organizationId, request.query, request.filters);
	const libraryKeys = new Set<string>();
	for (const identity of identities) {
		addLibraryIdentityKeys(libraryKeys, identity);
	}
	const catalog = await catalogPromise;
	const catalogItems = catalog.items.filter((item) => !isInLibrary(libraryKeys, item));
	const hasNextPage = library.nextPage !== null || catalog.totalPages > request.page;

	return {
		scope: "all",
		libraryItems: library.items,
		catalogItems,
		seasonsByMediaId: library.seasonsByMediaId,
		nextPage: hasNextPage ? request.page + 1 : null,
	};
}
