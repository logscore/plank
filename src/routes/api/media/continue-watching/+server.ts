import { error, json } from "@sveltejs/kit";
import { mediaDb } from "$lib/server/db";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(403, "Active profile required");
	}
	return json(mediaDb.getRecentlyWatched(organizationId, 20));
};
