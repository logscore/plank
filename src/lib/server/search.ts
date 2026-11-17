import type { CatalogSearchRequest, CatalogSearchResponse } from "$lib/data/search";
import { mediaDb, seasonsDb } from "$lib/server/db";
import type { BrowseItem } from "$lib/server/tmdb";
import { searchTmdbCatalog } from "$lib/server/tmdb";
import type { Media } from "$lib/types";

type LibraryResponse = Extract<CatalogSearchResponse, { scope: "library" }>;

/** A pageSize of null returns the whole library in one response. */
function searchLibrary(
	organizationId: string,
	request: CatalogSearchRequest,
	pageSize: number | null
): LibraryResponse {
	const limit = pageSize === null ? 2000 : pageSize + 1;
	const offset = pageSize === null ? 0 : (request.page - 1) * pageSize;
	const pageItems = mediaDb.search(organizationId, request.query, request.filters, limit, offset);
	const hasNextPage = pageSize !== null && pageItems.length > pageSize;
	const items = hasNextPage ? pageItems.slice(0, pageSize) : pageItems;
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

	if (request.filters.scope === "library") {
		return searchLibrary(organizationId, request, null);
	}

	const library = searchLibrary(organizationId, request, 20);
	const catalog = await searchTmdbCatalog(request);
	const identities = mediaDb.searchIdentities(organizationId, request.query, request.filters, catalog.items);
	const libraryKeys = new Set<string>();
	for (const identity of identities) {
		addLibraryIdentityKeys(libraryKeys, identity);
	}
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
