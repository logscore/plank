import { createInfiniteQuery } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/query-keys';
import { type BrowseItem, type BrowseResponse, fetchBrowse } from './browse-queries';

export interface InfiniteBrowseData {
	pages: BrowseResponse[];
	pageParams: number[];
}

/**
 * Create an infinite query for browsing trending/popular content
 */
export function createInfiniteBrowseQuery(type: () => 'trending' | 'popular', filter: () => 'all' | 'movie' | 'tv') {
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.browse.infinite(type(), filter()),
		queryFn: ({ pageParam }) => fetchBrowse(type(), filter(), pageParam),
		initialPageParam: 1,
		getNextPageParam: (lastPage: BrowseResponse): number | undefined => {
			return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	}));
}

/**
 * Helper to flatten infinite query pages into a single array of items
 */
export function flattenBrowsePages(data: InfiniteBrowseData | undefined): BrowseItem[] {
	if (!data) {
		return [];
	}

	const seen = new Set<number>();
	const items: BrowseItem[] = [];

	for (const page of data.pages) {
		for (const item of page.items) {
			if (!seen.has(item.tmdbId)) {
				seen.add(item.tmdbId);
				items.push(item);
			}
		}
	}

	return items;
}

/**
 * Get total pages from infinite query data
 */
export function getTotalPages(data: InfiniteBrowseData | undefined): number {
	if (!data || data.pages.length === 0) {
		return 0;
	}
	return data.pages[0].totalPages;
}
