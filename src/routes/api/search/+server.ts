import { error, json } from "@sveltejs/kit";
import { parseCatalogSearchParams, toCatalogSearchJson } from "$lib/data/search";
import { requireOrganizationAccess } from "$lib/server/api-guard";
import { searchCatalog } from "$lib/server/search";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
	const { organizationId } = requireOrganizationAccess(locals);
	const request = parseCatalogSearchParams(url.searchParams);

	try {
		return json(toCatalogSearchJson(await searchCatalog(organizationId, request)));
	} catch (cause) {
		console.error("[Search] Catalog request failed:", cause);
		throw error(502, "Search service unavailable");
	}
};
