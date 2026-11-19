import { emptyCatalogSearchResponse, parseCatalogSearchParams } from "$lib/data/search";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { searchCatalog } from "$lib/server/search";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ depends, locals, url }) => {
	const { organizationId, allowedRatings } = requireOrganizationAccess(locals);
	depends("/api/media");
	depends("/api/search");

	const request = parseCatalogSearchParams(url.searchParams);
	// The search page stays empty until the user searches for something.
	const response = request.query.trim()
		? await searchCatalog(organizationId, allowedRatings, request)
		: emptyCatalogSearchResponse(request.filters.scope);
	return { request, response };
};
