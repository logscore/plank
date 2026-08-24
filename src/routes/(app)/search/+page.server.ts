import { error } from "@sveltejs/kit";
import { mediaDb, seasonsDb } from "$lib/server/db";
import { type BrowseItem, getBrowseItemDetails, searchTmdbCatalog } from "$lib/server/tmdb";
import { getCachedTorrents } from "$lib/server/torrent-cache";
import type { PageServerLoad } from "./$types";

async function enrichTmdbResults(items: BrowseItem[]): Promise<BrowseItem[]> {
	const details = await Promise.all(
		items.map(async (item) => ({
			tmdbId: item.tmdbId,
			...(await getBrowseItemDetails(item.tmdbId, item.mediaType)),
		}))
	);
	const cachedTorrents = await getCachedTorrents(details.flatMap((detail) => (detail.imdbId ? [detail.imdbId] : [])));
	const detailsByTmdbId = new Map(details.map((detail) => [detail.tmdbId, detail]));

	return items.map((item) => {
		const detail = detailsByTmdbId.get(item.tmdbId);
		const magnetLink = detail?.imdbId ? cachedTorrents.get(detail.imdbId)?.magnetLink : undefined;
		return {
			...item,
			imdbId: detail?.imdbId ?? item.imdbId,
			certification: detail?.certification ?? item.certification,
			magnetLink,
			needsResolve: !magnetLink,
		};
	});
}

export const load: PageServerLoad = async ({ depends, locals, url }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw error(403, "Active profile required");
	}

	depends("/api/media");

	const query = url.searchParams.get("q")?.trim() ?? "";
	const searchType = url.searchParams.get("type") === "tmdb" ? "tmdb" : "local";
	const localResults = searchType === "local" && query.length >= 2 ? mediaDb.search(organizationId, query) : [];
	let tmdbResults: BrowseItem[] = [];
	if (searchType === "tmdb" && query.length >= 2) {
		try {
			const result = await searchTmdbCatalog(query);
			tmdbResults = await enrichTmdbResults(result.items);
		} catch (errorValue) {
			console.error("[Search] TMDB search failed:", errorValue);
		}
	}

	return {
		query,
		searchType,
		localResults,
		tmdbResults,
		seasonsByMediaId: Object.fromEntries(
			localResults
				.filter((media) => media.type === "show")
				.map((show) => [show.id, seasonsDb.getWithEpisodes(show.id)])
		),
	};
};
