import { getRatingLimit } from "$lib/server/rating-limit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	const ratingLimit = locals.user && organizationId ? getRatingLimit(locals.user.id, organizationId) : null;
	return { user: locals.user, ratingLimit };
};
