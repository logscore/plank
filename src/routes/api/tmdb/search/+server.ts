/**
 * TMDB Search API - Search movies and shows
 *
 * Returns search results immediately without detail enrichment.
 * Consumers can enrich IMDB IDs, certifications, and cached magnets
 * through the browse details service.
 */

import { error, json } from "@sveltejs/kit";
import { searchTmdbCatalog } from "$lib/server/tmdb";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, "Unauthorized");
	}

	const query = url.searchParams.get("q")?.trim() || "";
	const type = (url.searchParams.get("type") as "all" | "movie" | "show") || "all";
	const page = Number.parseInt(url.searchParams.get("page") || "1", 10);

	if (query.length < 2) {
		return json({ results: [], total: 0, page: 1, totalPages: 0 });
	}

	try {
		const result = await searchTmdbCatalog(query, type, page);
		return json({
			results: result.items,
			total: result.total,
			page: result.page,
			totalPages: result.totalPages,
		});
	} catch (err) {
		console.error("Search error:", err);
		throw error(500, "Internal server error");
	}
};
