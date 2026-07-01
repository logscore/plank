import { json } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import { type AddMediaFromMagnetParams, addMediaFromMagnet, isBrowseSeasonRequest } from "$lib/server/media-library";
import { addSeasonFromBrowse } from "$lib/server/season-sync";
import type { MediaType } from "$lib/types";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
	const { organizationId } = requireAuth(locals);
	const type = url.searchParams.get("type") as MediaType | null;
	const list = mediaDb.list(organizationId, type ?? undefined);
	return json(list);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const context = requireAuth(locals);
	const body = (await request.json()) as Record<string, unknown>;

	if (isBrowseSeasonRequest(body)) {
		const result = await addSeasonFromBrowse(context, body);
		return json(result, { status: 202 });
	}

	const result = await addMediaFromMagnet(context, body as unknown as AddMediaFromMagnetParams);
	return json(result.body, { status: result.status });
};
