import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const type = (url.searchParams.get("type") as "trending" | "popular") || "trending";
	const filter = (url.searchParams.get("filter") as "all" | "movie" | "show") || "all";

	return { type, filter };
};
