import { json } from "@sveltejs/kit";
import { DEFAULT_CATALOG_FILTERS, parseCatalogSearchParams } from "$lib/data/search";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { filterAllowedTitles } from "$lib/server/rating-limit";
import { getTrending, searchTmdbCatalog } from "$lib/server/tmdb";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals }) => {
	const { allowedRatings } = requireOrganizationAccess(locals);
	const request = parseCatalogSearchParams(url.searchParams);
	const filters = { ...request.filters, scope: "catalog" as const };
	// Trending has no rating filter, so a rating limit browses popular titles instead.
	const useTrending =
		allowedRatings === null &&
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

	const result = await searchTmdbCatalog({ ...request, filters }, allowedRatings);
	return json({
		items: allowedRatings ? await filterAllowedTitles(result.items, allowedRatings) : result.items,
		page: result.page,
		totalPages: result.totalPages,
	});
};
