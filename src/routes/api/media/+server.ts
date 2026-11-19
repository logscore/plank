import { json } from "@sveltejs/kit";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { type AddMediaFromMagnetParams, addMediaFromMagnet, isBrowseSeasonRequest } from "$lib/server/media-library";
import { allowedMovieParams, requireAllowedTitle } from "$lib/server/rating-limit";
import { addSeasonFromBrowse } from "$lib/server/season-sync";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
	const { userId, organizationId, allowedRatings } = requireOrganizationAccess(locals);
	const body = (await request.json()) as Record<string, unknown>;

	if (isBrowseSeasonRequest(body)) {
		if (allowedRatings) {
			await requireAllowedTitle(body.tmdbId, "show", allowedRatings);
		}
		await addSeasonFromBrowse(userId, organizationId, body);
		return new Response(null, { status: 202 });
	}

	const params = allowedRatings
		? await allowedMovieParams(body.tmdbId, allowedRatings)
		: (body as unknown as AddMediaFromMagnetParams);
	const result = await addMediaFromMagnet(userId, organizationId, params);
	return json(result.body, { status: result.status });
};
