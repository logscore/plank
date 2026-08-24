import { parseCatalogSearchParams } from "$lib/data/search";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
	const parsedRequest = parseCatalogSearchParams(url.searchParams);
	return {
		request: {
			...parsedRequest,
			query: "",
			filters: { ...parsedRequest.filters, scope: "catalog" as const },
		},
	};
};
