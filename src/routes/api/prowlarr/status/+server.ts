/**
 * Prowlarr Status API
 *
 * Returns configuration status for Prowlarr integration
 */

import { json } from '@sveltejs/kit';
import { getProwlarrIndexers, type ProwlarrIndexer, testProwlarrConnection } from '$lib/server/prowlarr';
import { getSettings } from '$lib/server/settings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	// Auth check
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const settings = await getSettings();
	const { url, apiKey } = settings.prowlarr;

	// Check if basic config is present
	const hasConfig = !!apiKey;

	// If we have config, try to test the connection
	let connectionStatus = 'not_configured';
	let indexers: ProwlarrIndexer[] = [];

	if (hasConfig) {
		const testResult = await testProwlarrConnection(url, apiKey);

		if (testResult.success) {
			connectionStatus = 'connected';
			// Get indexers
			indexers = await getProwlarrIndexers();
		} else {
			connectionStatus = 'connection_failed';
		}
	}

	return json({
		configured: hasConfig,
		url,
		connectionStatus,
		indexerCount: indexers.length,
		indexers,
		needsSetup: !hasConfig || indexers.length === 0,
	});
};
