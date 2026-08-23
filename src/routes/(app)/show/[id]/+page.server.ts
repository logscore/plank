import { error } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { mediaDb, seasonsDb } from "$lib/server/db";
import type { Media, SeasonWithEpisodes } from "$lib/types";
import type { PageServerLoad } from "./$types";

interface ShowPageData {
	media: Media;
	seasons: SeasonWithEpisodes[];
}

export const load: PageServerLoad<ShowPageData> = ({ depends, locals, params }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	if (mediaItem.type !== "show") {
		throw error(400, "Not a show");
	}

	depends(`/api/media/${params.id}`);

	const seasons = seasonsDb.getByMediaId(params.id).map((season) => ({
		...season,
		episodes: mediaDb.getEpisodesBySeasonId(season.id),
	}));

	return { media: mediaItem, seasons };
};
