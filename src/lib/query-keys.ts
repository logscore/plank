export const queryKeys = {
	// Browse queries
	browse: {
		all: ["browse"] as const,
		trending: (filter: "all" | "movie" | "show", page: number) =>
			[...queryKeys.browse.all, "trending", filter, page] as const,
		popular: (filter: "all" | "movie" | "show", page: number) =>
			[...queryKeys.browse.all, "popular", filter, page] as const,
		infinite: (type: "trending" | "popular", filter: "all" | "movie" | "show") =>
			[...queryKeys.browse.all, "infinite", type, filter] as const,
		details: (tmdbIds: number[]) => [...queryKeys.browse.all, "details", ...tmdbIds.toSorted()] as const,
		resolve: (tmdbId: number) => [...queryKeys.browse.all, "resolve", tmdbId] as const,
		seasons: (tmdbId: number) => [...queryKeys.browse.all, "seasons", tmdbId] as const,
	},

	// Torrent queries
	torrents: {
		all: ["torrents"] as const,
		search: (params: Record<string, unknown>) => [...queryKeys.torrents.all, "search", params] as const,
		browse: (category: string, params: Record<string, unknown>) =>
			[...queryKeys.torrents.all, "browse", category, params] as const,
		cache: (imdbIds: string[]) => [...queryKeys.torrents.all, "cache", imdbIds.sort()] as const,
	},

	// System queries
	system: {
		all: ["system"] as const,
		prowlarr: {
			status: () => [...queryKeys.system.all, "prowlarr", "status"] as const,
			test: () => [...queryKeys.system.all, "prowlarr", "test"] as const,
			indexers: () => [...queryKeys.system.all, "prowlarr", "indexers"] as const,
			schemas: () => [...queryKeys.system.all, "prowlarr", "schemas"] as const,
		},
	},
} as const;
