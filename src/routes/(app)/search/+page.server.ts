import { parseCatalogSearchParams } from "$lib/data/search";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { searchCatalog } from "$lib/server/search";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ depends, locals, url }) => {
	const { organizationId } = requireOrganizationAccess(locals);
	depends("/api/media");
	depends("/api/search");

	const request = parseCatalogSearchParams(url.searchParams);
	return {
		request,
		response: await searchCatalog(organizationId, request),
	};
};
