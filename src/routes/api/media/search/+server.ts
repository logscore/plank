import { error, json } from "@sveltejs/kit";
import { mediaDb } from "$lib/server/db";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(403, "Active profile required");
	}

	const query = url.searchParams.get("q");
	const typeParam = url.searchParams.get("type");

	if (!query || query.length < 2) {
		return json([]);
	}

	try {
		const type = typeParam === "movie" || typeParam === "show" ? typeParam : undefined;
		return json(mediaDb.search(organizationId, query, type));
	} catch (err) {
		console.error("Search failed:", err);
		throw error(500, "Failed to search library");
	}
};
