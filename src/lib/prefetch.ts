import { fetchBrowse } from '$lib/queries/browse-queries';
import { fetchMediaDetail } from '$lib/queries/media-queries';
import { queryClient } from '$lib/query-client';
import { queryKeys } from '$lib/query-keys';

/**
 * Prefetch browse data (trending/popular) immediately
 */
export function prefetchBrowse(type: 'trending' | 'popular', filter: 'all' | 'movie' | 'tv' = 'all') {
	queryClient.prefetchInfiniteQuery({
		queryKey: queryKeys.browse.infinite(type, filter),
		queryFn: ({ pageParam }) => fetchBrowse(type, filter, pageParam),
		initialPageParam: 1,
		staleTime: 30 * 60 * 1000, // 30 minutes
	});
}

/**
 * Prefetch media detail immediately
 */
export function prefetchMediaDetail(id: string) {
	queryClient.prefetchQuery({
		queryKey: queryKeys.media.detail(id),
		queryFn: () => fetchMediaDetail(id),
		staleTime: 30 * 60 * 1000, // 30 minutes
	});
}

/**
 * Prefetch both browse tabs (trending and popular) for a given filter
 * Call this on page load to warm the cache for tab switching
 */
export function prefetchBothBrowseTabs(filter: 'all' | 'movie' | 'tv' = 'all') {
	prefetchBrowse('trending', filter);
	prefetchBrowse('popular', filter);
}
