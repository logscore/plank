export const queryKeys = {
	// Media queries
	media: {
		all: ['media'] as const,
		lists: () => [...queryKeys.media.all, 'list'] as const,
		list: (type: 'movie' | 'tv' | 'all') => [...queryKeys.media.lists(), type] as const,
		detail: (id: string) => [...queryKeys.media.all, 'detail', id] as const,
		search: (query: string) => [...queryKeys.media.all, 'search', query] as const,
	},

	// Browse queries
	browse: {
		all: ['browse'] as const,
		trending: (filter: 'all' | 'movie' | 'tv', page: number) =>
			[...queryKeys.browse.all, 'trending', filter, page] as const,
		popular: (filter: 'all' | 'movie' | 'tv', page: number) =>
			[...queryKeys.browse.all, 'popular', filter, page] as const,
		infinite: (type: 'trending' | 'popular', filter: 'all' | 'movie' | 'tv') =>
			[...queryKeys.browse.all, 'infinite', type, filter] as const,
		resolve: (tmdbId: number) => [...queryKeys.browse.all, 'resolve', tmdbId] as const,
	},

	// Torrent queries
	torrents: {
		all: ['torrents'] as const,
		search: (params: Record<string, unknown>) => [...queryKeys.torrents.all, 'search', params] as const,
		browse: (category: string, params: Record<string, unknown>) =>
			[...queryKeys.torrents.all, 'browse', category, params] as const,
		cache: (imdbIds: string[]) => [...queryKeys.torrents.all, 'cache', imdbIds.sort()] as const,
	},

	// System queries
	system: {
		all: ['system'] as const,
		jackett: {
			status: () => [...queryKeys.system.all, 'jackett', 'status'] as const,
			test: () => [...queryKeys.system.all, 'jackett', 'test'] as const,
		},
	},
} as const;
