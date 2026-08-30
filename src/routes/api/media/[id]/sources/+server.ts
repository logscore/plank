import { json } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import { searchSourceCandidates } from "$lib/server/prowlarr";
import type { RequestHandler } from "./$types";

type MediaItem = NonNullable<ReturnType<typeof mediaDb.getById>>;

/** Search text: "Show S01E02" for an episode, "Movie 1999" for a movie. */
function buildQuery(mediaItem: MediaItem): string {
	if (mediaItem.type === "episode" && mediaItem.seasonNumber && mediaItem.episodeNumber) {
		const show = mediaItem.parentId ? mediaDb.getById(mediaItem.parentId) : null;
		const season = String(mediaItem.seasonNumber).padStart(2, "0");
		const episode = String(mediaItem.episodeNumber).padStart(2, "0");
		return `${show?.title ?? mediaItem.title} S${season}E${episode}`;
	}
	return mediaItem.year ? `${mediaItem.title} ${mediaItem.year}` : mediaItem.title;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	const query = buildQuery(mediaItem);
	if (!query) {
		return json({ query, results: [] });
	}

	const results = await searchSourceCandidates(query, mediaItem.type === "episode");
	return json({ query, results });
};
