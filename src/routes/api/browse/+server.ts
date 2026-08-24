import { error, json } from "@sveltejs/kit";
import { type CatalogFilters, getCatalogGenreLabels, parseCatalogSearchParams } from "$lib/data/search";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { type BrowseItem, getPopular, getTrending } from "$lib/server/tmdb";
import type { RequestHandler } from "./$types";

function filterItems(items: BrowseItem[], filters: CatalogFilters): BrowseItem[] {
	const genreLabels = new Set(getCatalogGenreLabels(filters.genres).map((genre) => genre.toLocaleLowerCase()));
	const filtered = items.filter((item) => {
		if (item.voteAverage !== null && item.voteAverage < filters.rating) {
			return false;
		}
		if (filters.rating > 0 && item.voteAverage === null) {
			return false;
		}
		if (filters.yearFrom !== null && (item.year === null || item.year < filters.yearFrom)) {
			return false;
		}
		if (filters.yearTo !== null && (item.year === null || item.year > filters.yearTo)) {
			return false;
		}
		if (genreLabels.size > 0 && !item.genres.some((genre) => genreLabels.has(genre.toLocaleLowerCase()))) {
			return false;
		}
		return true;
	});

	if (filters.sort === "rating") {
		return filtered.toSorted((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
	}
	if (filters.sort === "newest") {
		return filtered.toSorted((a, b) => (b.year ?? 0) - (a.year ?? 0));
	}
	if (filters.sort === "oldest") {
		return filtered.toSorted((a, b) => (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER));
	}
	return filtered;
}

function interleave(left: BrowseItem[], right: BrowseItem[]): BrowseItem[] {
	const items: BrowseItem[] = [];
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		const leftItem = left[index];
		const rightItem = right[index];
		if (leftItem) {
			items.push(leftItem);
		}
		if (rightItem) {
			items.push(rightItem);
		}
	}
	return items;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	requireOrganizationAccess(locals);
	const type = url.searchParams.get("type") ?? "trending";
	if (type !== "trending" && type !== "popular") {
		throw error(400, 'Invalid type. Use "trending" or "popular"');
	}

	const request = parseCatalogSearchParams(url.searchParams);
	const filters: CatalogFilters = { ...request.filters, scope: "catalog" };
	if (type === "trending") {
		const result = await getTrending("day", request.page, filters.media);
		return json({
			items: filterItems(result.items, filters),
			page: request.page,
			totalPages: result.totalPages,
		});
	}

	if (filters.media !== "all") {
		const result = await getPopular(request.page, filters.media);
		return json({
			items: filterItems(result.items, filters),
			page: request.page,
			totalPages: result.totalPages,
		});
	}

	const [movies, shows] = await Promise.all([getPopular(request.page, "movie"), getPopular(request.page, "show")]);
	return json({
		items: filterItems(interleave(movies.items, shows.items), filters),
		page: request.page,
		totalPages: Math.max(movies.totalPages, shows.totalPages),
	});
};
