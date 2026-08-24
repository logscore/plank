import { error } from "@sveltejs/kit";
import { mediaDb, seasonsDb } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ depends, locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw error(403, "Active profile required");
	}

	depends("/api/media");
	const movies = mediaDb.list(organizationId, "movie");
	const shows = mediaDb.list(organizationId, "show");

	return {
		movies,
		shows,
		continueWatching: mediaDb.getRecentlyWatched(organizationId, 20),
		seasonsByMediaId: Object.fromEntries(shows.map((show) => [show.id, seasonsDb.getWithEpisodes(show.id)])),
	};
};
