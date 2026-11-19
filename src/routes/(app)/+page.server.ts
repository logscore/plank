import { parseCatalogSearchParams } from "$lib/data/search";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import { searchCatalog } from "$lib/server/search";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ depends, locals, url }) => {
	const { organizationId, allowedRatings } = requireOrganizationAccess(locals);
	depends("/api/media");
	depends("/api/search");

	const parsedRequest = parseCatalogSearchParams(url.searchParams);
	const request = {
		...parsedRequest,
		query: "",
		filters: {
			...parsedRequest.filters,
			scope: "library" as const,
		},
	};
	return {
		request,
		response: await searchCatalog(organizationId, allowedRatings, request),
		continueWatching: mediaDb.getRecentlyWatched(organizationId, allowedRatings),
		errorCount: mediaDb.countDownloadErrors(organizationId, allowedRatings),
	};
};
