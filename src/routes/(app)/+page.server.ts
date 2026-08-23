import { error } from "@sveltejs/kit";
import { mediaDb } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ depends, locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw error(403, "Active profile required");
	}

	depends("/api/media");

	return {
		movies: mediaDb.list(organizationId, "movie"),
		shows: mediaDb.list(organizationId, "show"),
		continueWatching: mediaDb.getRecentlyWatched(organizationId, 20),
	};
};
