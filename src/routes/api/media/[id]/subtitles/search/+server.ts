import { error, json } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import { searchSubtitles } from "$lib/server/opensubtitles";
import type { RequestHandler } from "./$types";

function parseOptionalNumber(value: string | null): number | undefined {
	if (value === null) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	const isEpisode = mediaItem.type === "episode";
	const show = isEpisode && mediaItem.parentId ? mediaDb.getById(mediaItem.parentId) : undefined;
	const title = show ?? mediaItem;

	const languages = url.searchParams.get("languages") ?? undefined;
	const seasonNumber = mediaItem.seasonNumber ?? parseOptionalNumber(url.searchParams.get("seasonNumber"));
	const episodeNumber = mediaItem.episodeNumber ?? parseOptionalNumber(url.searchParams.get("episodeNumber"));

	try {
		const results = await searchSubtitles({
			tmdbId: show ? undefined : (mediaItem.tmdbId ?? undefined),
			imdbId: show ? undefined : (mediaItem.imdbId ?? undefined),
			parentTmdbId: show?.tmdbId ?? undefined,
			parentImdbId: show?.imdbId ?? undefined,
			query: title.tmdbId || title.imdbId ? undefined : title.title,
			year: isEpisode ? undefined : (mediaItem.year ?? undefined),
			languages,
			seasonNumber,
			episodeNumber,
		});
		return json(results);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Search failed";
		throw error(500, message);
	}
};
