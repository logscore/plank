import type { BrowseResponse } from '$lib/queries/browse-queries';
import { fetchBrowse, fetchProwlarrStatus } from '$lib/queries/browse-queries';
import { queryClient } from '$lib/query-client';
import { queryKeys } from '$lib/query-keys';

// How many poster images to preload per tab (first visible page of items)
const IMAGE_PRELOAD_COUNT = 18;

/**
 * Preload poster images into the browser's HTTP cache via Image objects.
 * Runs at idle priority so it doesn't block anything.
 */
function preloadImages(items: { posterUrl: string | null }[]) {
	const urls = items
		.slice(0, IMAGE_PRELOAD_COUNT)
		.map((item) => item.posterUrl)
		.filter((url): url is string => url !== null);

	const load = () => {
		for (const url of urls) {
			const img = new Image();
			img.src = url;
		}
	};

	// Use requestIdleCallback if available, otherwise setTimeout
	if (typeof requestIdleCallback === 'function') {
		requestIdleCallback(load);
	} else {
		setTimeout(load, 0);
	}
}

/**
 * Prefetch browse data (trending/popular) and preload poster images.
 */
export function prefetchBrowse(type: 'trending' | 'popular', filter: 'all' | 'movie' | 'show' = 'all') {
	queryClient
		.prefetchInfiniteQuery({
			queryKey: queryKeys.browse.infinite(type, filter),
			queryFn: ({ pageParam }) => fetchBrowse(type, filter, pageParam),
			initialPageParam: 1,
			staleTime: 30 * 60 * 1000, // 30 minutes
		})
		.then(() => {
			// After data is cached, preload poster images from page 1
			const data = queryClient.getQueryData<{ pages: BrowseResponse[] }>(queryKeys.browse.infinite(type, filter));
			const firstPage = data?.pages?.[0];
			if (firstPage?.items) {
				preloadImages(firstPage.items);
			}
		});
}

/**
 * Prefetch both browse tabs (trending and popular) for a given filter
 * Call this on page load to warm the cache for tab switching
 */
export function prefetchBothBrowseTabs(filter: 'all' | 'movie' | 'show' = 'all') {
	prefetchBrowse('trending', filter);
	prefetchBrowse('popular', filter);
}

/**
 * Prefetch all browse-related data (Prowlarr status + both tabs).
 * Call this from the app layout so data is warm before the user navigates to /browse.
 */
export function prefetchBrowseData() {
	queryClient.prefetchQuery({
		queryKey: queryKeys.system.prowlarr.status(),
		queryFn: fetchProwlarrStatus,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
	prefetchBothBrowseTabs('all');
}
