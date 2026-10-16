import { error, json } from "@sveltejs/kit";
import { type AddMediaFromMagnetParams, addMediaFromMagnet, isBrowseSeasonRequest } from "$lib/server/media-library";
import { addSeasonFromBrowse } from "$lib/server/season-sync";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw error(403, "Active profile required");
	}

	const body = (await request.json()) as Record<string, unknown>;

	if (isBrowseSeasonRequest(body)) {
		await addSeasonFromBrowse(locals.user.id, organizationId, body);
		return new Response(null, { status: 202 });
	}

	const result = await addMediaFromMagnet(
		locals.user.id,
		organizationId,
		body as unknown as AddMediaFromMagnetParams
	);
	return json(result.body, { status: result.status });
};
