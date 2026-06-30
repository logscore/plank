/**
 * TMDB API Proxy for movie search
 *
 * Proxies search requests to TMDB API to avoid CORS issues
 * and keep API key secure on server-side
 */

import { error, json } from "@sveltejs/kit";
import { getSettings } from "$lib/server/settings";
import type { RequestHandler } from "./$types";

const settings = await getSettings();

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get("query");
	const year = url.searchParams.get("year");

	if (!query) {
		throw error(400, "Missing query parameter");
	}

	if (!settings.tmdb.apiKey) {
		throw error(500, "TMDB API key not configured");
	}

	const params = new URLSearchParams({
		api_key: settings.tmdb.apiKey,
		query,
	});

	if (year) {
		params.set("year", year);
	}

	try {
		const response = await fetch(`${settings.tmdb.baseUrl}/search/movie?${params}`, {
			headers: { Accept: "application/json" },
		});

		if (!response.ok) {
			throw error(response.status, `TMDB API error: ${response.statusText}`);
		}

		const data = await response.json();
		return json(data);
	} catch (err) {
		if (err instanceof Error && "status" in err) {
			throw err;
		}
		console.error("TMDB proxy error:", err);
		throw error(500, "Failed to fetch from TMDB");
	}
};
