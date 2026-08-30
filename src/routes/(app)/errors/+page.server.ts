import { requireOrganizationAccess } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ depends, locals }) => {
	const { organizationId } = requireOrganizationAccess(locals);
	depends("/api/media");

	return mediaDb.listDownloadErrors(organizationId);
};
