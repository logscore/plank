import { error, json } from "@sveltejs/kit";
import { toRatingLimit } from "$lib/rating-limit";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { setMemberRatingLimit } from "$lib/server/rating-limit";
import type { RequestHandler } from "./$types";

/** Set the highest age rating one member sees in the active profile. A null maxRating removes the limit. */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { userId, organizationId } = requireOrganizationAccess(locals);
	const body: unknown = await request.json().catch(() => null);
	if (typeof body !== "object" || body === null || !("maxRating" in body)) {
		error(400, "maxRating is required");
	}
	const maxRating = toRatingLimit(body.maxRating);
	if (body.maxRating !== null && maxRating === null) {
		error(400, "Unknown rating");
	}

	setMemberRatingLimit(userId, organizationId, params.id, maxRating);
	return json({ maxRating });
};
