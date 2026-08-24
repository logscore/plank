import { json } from "@sveltejs/kit";
import { DEFAULT_CATALOG_FILTERS, parseCatalogSearchParams } from "$lib/data/search";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { getTrending, searchTmdbCatalog } from "$lib/server/tmdb";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals }) => {
	requireOrganizationAccess(locals);
	const request = parseCatalogSearchParams(url.searchParams);
	const filters = { ...request.filters, scope: "catalog" as const };
	const useTrending =
		filters.rating === DEFAULT_CATALOG_FILTERS.rating &&
		filters.yearFrom === null &&
		filters.yearTo === null &&
		filters.genres.length === 0 &&
		filters.sort === DEFAULT_CATALOG_FILTERS.sort;

	if (useTrending) {
		const result = await getTrending("day", request.page, filters.media);
		return json({
			items: result.items,
			page: request.page,
			totalPages: result.totalPages,
		});
	}

	const result = await searchTmdbCatalog({ ...request, filters });
	return json({
		items: result.items,
		page: result.page,
		totalPages: result.totalPages,
	});
};
