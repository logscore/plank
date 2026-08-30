import { requireMediaAccess } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
	requireMediaAccess(locals, params.id);
	mediaDb.markWatched(params.id);
	return new Response(null, { status: 204 });
};
