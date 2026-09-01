import { requireOrganizationAccess } from "$lib/server/api-guard";
import { buildQueue } from "$lib/server/queue";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ depends, locals }) => {
	const { organizationId } = requireOrganizationAccess(locals);
	depends("/api/media");

	return { entries: buildQueue(organizationId) };
};
