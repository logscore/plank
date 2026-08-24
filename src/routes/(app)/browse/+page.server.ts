import { parseCatalogSearchParams } from "$lib/data/search";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
	const requestedType = url.searchParams.get("type");
	const type = requestedType === "popular" ? "popular" : "trending";
	const parsedRequest = parseCatalogSearchParams(url.searchParams);
	return {
		type,
		request: {
			...parsedRequest,
			query: "",
			filters: { ...parsedRequest.filters, scope: "catalog" as const },
		},
	};
};
