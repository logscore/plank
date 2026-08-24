import type { BrowseItem } from "$lib/server/tmdb";
import type { Media, SeasonWithEpisodes } from "$lib/types";

export type SearchScope = "all" | "library" | "catalog";
export type CatalogMediaType = "all" | "movie" | "show";
export type CatalogSort = "relevance" | "rating" | "newest" | "oldest" | "popular";

interface CatalogGenre {
	key: string;
	label: string;
	movieId?: number;
	showId?: number;
	aliases?: string[];
}

export interface CatalogFilters {
	scope: SearchScope;
	media: CatalogMediaType;
	rating: number;
	yearFrom: number | null;
	yearTo: number | null;
	genres: string[];
	sort: CatalogSort;
}

export interface CatalogSearchRequest {
	query: string;
	page: number;
	filters: CatalogFilters;
}

export type CatalogSearchResponse =
	| {
			scope: "all";
			libraryItems: Media[];
			catalogItems: BrowseItem[];
			seasonsByMediaId: Record<string, SeasonWithEpisodes[]>;
			nextPage: number | null;
	  }
	| {
			scope: "library";
			items: Media[];
			seasonsByMediaId: Record<string, SeasonWithEpisodes[]>;
			nextPage: number | null;
	  }
	| {
			scope: "catalog";
			items: BrowseItem[];
			nextPage: number | null;
	  };

export const CATALOG_GENRES: CatalogGenre[] = [
	{ key: "action", label: "Action", movieId: 28, showId: 10_759, aliases: ["Action & Adventure"] },
	{ key: "adventure", label: "Adventure", movieId: 12, showId: 10_759, aliases: ["Action & Adventure"] },
	{ key: "animation", label: "Animation", movieId: 16, showId: 16 },
	{ key: "comedy", label: "Comedy", movieId: 35, showId: 35 },
	{ key: "crime", label: "Crime", movieId: 80, showId: 80 },
	{ key: "documentary", label: "Documentary", movieId: 99, showId: 99 },
	{ key: "drama", label: "Drama", movieId: 18, showId: 18 },
	{ key: "family", label: "Family", movieId: 10_751, showId: 10_751 },
	{ key: "fantasy", label: "Fantasy", movieId: 14, showId: 10_765, aliases: ["Sci-Fi & Fantasy"] },
	{ key: "history", label: "History", movieId: 36 },
	{ key: "horror", label: "Horror", movieId: 27 },
	{ key: "kids", label: "Kids", showId: 10_762 },
	{ key: "music", label: "Music", movieId: 10_402 },
	{ key: "mystery", label: "Mystery", movieId: 9648, showId: 9648 },
	{ key: "reality", label: "Reality", showId: 10_764 },
	{ key: "romance", label: "Romance", movieId: 10_749 },
	{ key: "science-fiction", label: "Science Fiction", movieId: 878, showId: 10_765, aliases: ["Sci-Fi & Fantasy"] },
	{ key: "thriller", label: "Thriller", movieId: 53 },
	{ key: "war", label: "War", movieId: 10_752, showId: 10_768, aliases: ["War & Politics"] },
	{ key: "western", label: "Western", movieId: 37, showId: 37 },
];

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
	scope: "catalog",
	media: "all",
	rating: 0,
	yearFrom: null,
	yearTo: null,
	genres: [],
	sort: "relevance",
};

const VALID_SCOPES: Record<SearchScope, true> = { all: true, library: true, catalog: true };
const VALID_MEDIA_TYPES: Record<CatalogMediaType, true> = { all: true, movie: true, show: true };
const VALID_SORTS: Record<CatalogSort, true> = {
	relevance: true,
	rating: true,
	newest: true,
	oldest: true,
	popular: true,
};
const VALID_GENRES: Record<string, true> = Object.fromEntries(
	CATALOG_GENRES.map((genre) => [genre.key, true] as const)
);
const MIN_RELEASE_YEAR = 1874;
const MAX_RELEASE_YEAR = new Date().getFullYear() + 2;
const MAX_PAGE = 500;

function parseEnum<T extends string>(value: string | null, allowed: Record<T, true>, fallback: T): T {
	return value && allowed[value as T] ? (value as T) : fallback;
}

function parseRating(value: string | null): number {
	if (!value) {
		return 0;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 0;
	}
	return Math.round(Math.min(10, Math.max(0, parsed)) * 2) / 2;
}

function parseYear(value: string | null): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < MIN_RELEASE_YEAR || parsed > MAX_RELEASE_YEAR) {
		return null;
	}
	return parsed;
}

function parsePage(value: string | null): number {
	if (!value) {
		return 1;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) {
		return 1;
	}
	return Math.min(MAX_PAGE, Math.max(1, parsed));
}

export function parseCatalogSearchParams(searchParams: URLSearchParams): CatalogSearchRequest {
	let yearFrom = parseYear(searchParams.get("yearFrom"));
	let yearTo = parseYear(searchParams.get("yearTo"));
	if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
		[yearFrom, yearTo] = [yearTo, yearFrom];
	}

	const genres = [...new Set(searchParams.getAll("genre"))].filter((genre) => VALID_GENRES[genre]);

	return {
		query: searchParams.get("q")?.trim().slice(0, 200) ?? "",
		page: parsePage(searchParams.get("page")),
		filters: {
			scope: parseEnum(searchParams.get("scope"), VALID_SCOPES, DEFAULT_CATALOG_FILTERS.scope),
			media: parseEnum(searchParams.get("media"), VALID_MEDIA_TYPES, DEFAULT_CATALOG_FILTERS.media),
			rating: parseRating(searchParams.get("rating")),
			yearFrom,
			yearTo,
			genres,
			sort: parseEnum(searchParams.get("sort"), VALID_SORTS, DEFAULT_CATALOG_FILTERS.sort),
		},
	};
}

export function serializeCatalogSearch(request: CatalogSearchRequest): URLSearchParams {
	const params = new URLSearchParams();
	if (request.query) {
		params.set("q", request.query);
	}
	if (request.filters.scope !== DEFAULT_CATALOG_FILTERS.scope) {
		params.set("scope", request.filters.scope);
	}
	if (request.filters.media !== DEFAULT_CATALOG_FILTERS.media) {
		params.set("media", request.filters.media);
	}
	if (request.filters.rating > DEFAULT_CATALOG_FILTERS.rating) {
		params.set("rating", String(request.filters.rating));
	}
	if (request.filters.yearFrom !== null) {
		params.set("yearFrom", String(request.filters.yearFrom));
	}
	if (request.filters.yearTo !== null) {
		params.set("yearTo", String(request.filters.yearTo));
	}
	for (const genre of request.filters.genres) {
		if (VALID_GENRES[genre]) {
			params.append("genre", genre);
		}
	}
	if (request.filters.sort !== DEFAULT_CATALOG_FILTERS.sort) {
		params.set("sort", request.filters.sort);
	}
	if (request.page > 1) {
		params.set("page", String(Math.min(MAX_PAGE, request.page)));
	}
	return params;
}

export function getCatalogGenreIds(genres: string[], mediaType: "movie" | "show"): number[] | null {
	if (genres.length === 0) {
		return [];
	}
	const idKey = mediaType === "movie" ? "movieId" : "showId";
	const ids = CATALOG_GENRES.filter((genre) => genres.includes(genre.key))
		.map((genre) => genre[idKey])
		.filter((id): id is number => id !== undefined);
	return ids.length > 0 ? [...new Set(ids)] : null;
}

export function getCatalogGenreLabels(genres: string[]): string[] {
	return [
		...new Set(
			CATALOG_GENRES.filter((genre) => genres.includes(genre.key)).flatMap((genre) => [
				genre.label,
				...(genre.aliases ?? []),
			])
		),
	];
}
