import { createInfiniteQuery, createMutation } from "@tanstack/svelte-query";
import { invalidate } from "$app/navigation";
import { type CatalogFilters, DEFAULT_CATALOG_FILTERS, serializeCatalogSearch } from "$lib/data/search";
import type { BrowseItem, SeasonSummary } from "$lib/server/tmdb";
import type { Media } from "$lib/types";
import { apiRequest, queryClient } from "./client";
import { prefetchProwlarrStatus } from "./prowlarr";

export type { BrowseItem, SeasonSummary } from "$lib/server/tmdb";

const BROWSE_STALE_TIME_MS = 30 * 60 * 1000;
const RESOLVE_STALE_TIME_MS = 24 * 60 * 60 * 1000;
const SEASONS_STALE_TIME_MS = 60 * 60 * 1000;
const IMAGE_PRELOAD_COUNT = 18;

const browseKeys = {
	details: (tmdbIds: number[]) => ["browse", "details", ...tmdbIds.toSorted()] as const,
	infinite: (filters: CatalogFilters) => ["browse", "infinite", filters] as const,
	resolve: (tmdbId: number) => ["browse", "resolve", tmdbId] as const,
	seasons: (tmdbId: number) => ["browse", "seasons", tmdbId] as const,
};

export interface BrowseResponse {
	items: BrowseItem[];
	page: number;
	totalPages: number;
}

export interface ResolveResponse {
	error?: string;
	message?: string;
	success: boolean;
	torrent?: {
		magnetLink: string;
	};
}

export interface BrowseDetailItem {
	certification: string | null;
	imdbId: string | null;
	magnetLink?: string;
	tmdbId: number;
}

interface BrowseDetailsResponse {
	details: BrowseDetailItem[];
}

export interface SeasonsResponse {
	seasons: SeasonSummary[];
}

interface ResolveInput {
	imdbId: string | null;
	title: string;
	tmdbId: number;
	year: number | null;
}

function fetchBrowseDetails(items: { tmdbId: number; mediaType: "movie" | "show" }[]): Promise<BrowseDetailsResponse> {
	if (items.length === 0) {
		return Promise.resolve({ details: [] });
	}
	return apiRequest("/api/browse/details", "Failed to fetch browse details", {
		json: { items },
		method: "POST",
	});
}

export function fetchBrowse(filters: CatalogFilters, page = 1): Promise<BrowseResponse> {
	const params = serializeCatalogSearch({
		filters: { ...filters, scope: "catalog" },
		page,
		query: "",
	});
	params.delete("scope");
	return apiRequest(`/api/browse?${params}`, "Failed to fetch browse titles");
}

export function resolveTorrent(item: ResolveInput): Promise<ResolveResponse> {
	return apiRequest("/api/browse/resolve", "Failed to resolve torrent", {
		json: item,
		method: "POST",
	});
}

export function fetchSeasons(tmdbId: number): Promise<SeasonsResponse> {
	return apiRequest(`/api/browse/seasons/${tmdbId}`, "Failed to fetch seasons");
}

export function createBrowseInfiniteQuery(filters: () => CatalogFilters, enabled: () => boolean) {
	return createInfiniteQuery(() => ({
		enabled: enabled(),
		getNextPageParam: (lastPage: BrowseResponse) =>
			lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
		initialPageParam: 1,
		queryFn: ({ pageParam }) => fetchBrowse(filters(), pageParam),
		queryKey: browseKeys.infinite(filters()),
		staleTime: BROWSE_STALE_TIME_MS,
	}));
}

export function fetchBrowseDetailsCached(
	items: { tmdbId: number; mediaType: "movie" | "show" }[]
): Promise<BrowseDetailsResponse> {
	return queryClient.fetchQuery({
		queryFn: () => fetchBrowseDetails(items),
		queryKey: browseKeys.details(items.map((item) => item.tmdbId)),
		staleTime: BROWSE_STALE_TIME_MS,
	});
}

export function resolveTorrentCached(item: ResolveInput): Promise<ResolveResponse> {
	return queryClient.fetchQuery({
		queryFn: () => resolveTorrent(item),
		queryKey: browseKeys.resolve(item.tmdbId),
		staleTime: RESOLVE_STALE_TIME_MS,
	});
}

export function fetchSeasonsCached(tmdbId: number): Promise<SeasonsResponse> {
	return queryClient.fetchQuery({
		queryFn: () => fetchSeasons(tmdbId),
		queryKey: browseKeys.seasons(tmdbId),
		staleTime: SEASONS_STALE_TIME_MS,
	});
}

function preloadImages(items: { posterUrl: string | null }[]): void {
	const urls = items
		.slice(0, IMAGE_PRELOAD_COUNT)
		.map((item) => item.posterUrl)
		.filter((url): url is string => url !== null);
	const load = () => {
		for (const url of urls) {
			const image = new Image();
			image.src = url;
		}
	};
	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(load);
	} else {
		setTimeout(load, 0);
	}
}

function prefetchBrowse(filters: CatalogFilters = DEFAULT_CATALOG_FILTERS): void {
	queryClient
		.prefetchInfiniteQuery({
			initialPageParam: 1,
			queryFn: ({ pageParam }) => fetchBrowse(filters, pageParam),
			queryKey: browseKeys.infinite(filters),
			staleTime: BROWSE_STALE_TIME_MS,
		})
		.then(() => {
			const data = queryClient.getQueryData<{ pages: BrowseResponse[] }>(browseKeys.infinite(filters));
			const firstPage = data?.pages[0];
			if (firstPage) {
				preloadImages(firstPage.items);
			}
		});
}

export function prefetchBrowseData(): void {
	prefetchProwlarrStatus();
	prefetchBrowse();
}

interface AddFromBrowseMagnetParams {
	magnetLink: string;
	mode?: "magnet";
	title: string;
	tmdbId?: number;
	year?: number | null;
}

interface AddSeasonFromBrowseParams {
	backdropUrl?: string | null;
	certification?: string | null;
	genres?: string[] | null;
	mode: "browse-season";
	overview?: string | null;
	posterUrl?: string | null;
	seasonNumber: number;
	title: string;
	tmdbId: number;
	year?: number | null;
}

export type AddFromBrowseParams = AddFromBrowseMagnetParams | AddSeasonFromBrowseParams;
export type AddFromBrowseResponse = Media | undefined;

export function createAddFromBrowseMutation() {
	return createMutation<AddFromBrowseResponse, Error, AddFromBrowseParams>(() => ({
		mutationFn: (params) =>
			apiRequest("/api/media", "Failed to add to library", {
				json: params,
				method: "POST",
			}),
		onSuccess: async () => {
			await invalidate("/api/media");
		},
	}));
}
