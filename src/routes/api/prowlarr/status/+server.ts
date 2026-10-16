/**
 * Prowlarr Status API
 *
 * Returns configuration status for Prowlarr integration
 */

import { json } from "@sveltejs/kit";
import { getProwlarrIndexers, type ProwlarrIndexer, testProwlarrConnection } from "$lib/server/prowlarr";
import { getSettings } from "$lib/server/settings";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const settings = await getSettings();
	const { url, apiKey } = settings.prowlarr;

	// Check if basic config is present
	const hasConfig = !!apiKey;

	// If we have config, try to test the connection
	let indexers: ProwlarrIndexer[] = [];

	if (hasConfig) {
		const testResult = await testProwlarrConnection(url, apiKey);

		if (testResult.success) {
			// Get indexers
			indexers = await getProwlarrIndexers();
		}
	}

	return json({
		configured: hasConfig,
		needsSetup: !hasConfig || indexers.length === 0,
	});
};
