import { error, json } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { seasonsDb } from "$lib/server/db";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	if (mediaItem.type !== "show") {
		throw error(400, "Not a show");
	}
	return json(seasonsDb.getWithEpisodes(params.id));
};
