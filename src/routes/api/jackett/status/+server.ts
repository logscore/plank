/**
 * Jackett Status API
 *
 * Returns configuration status for Jackett integration
 */

import { json } from '@sveltejs/kit';
import { config } from '$lib/config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	// Auth check
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { url, apiKey } = config.jackett;

	// Check if basic config is present
	const hasConfig = !!apiKey;

	// If we have config, try to test the connection
	let connectionStatus = 'not_configured';
	let hasIndexers = false;

	if (hasConfig) {
		try {
			// Test Jackett connectivity with a limited movie search
			// Use a popular movie IMDB ID to test if indexers are working
			const testResponse = await fetch(
				`${url}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=tt0080684&Limit=1`,
				{
					headers: { Accept: 'application/json' },
					signal: AbortSignal.timeout(10_000), // 10 second timeout for search
				}
			);

			if (testResponse.ok) {
				const response = await testResponse.json();
				console.log('Jackett test search response:', response);

				// If we get any Results, it means at least one indexer is configured and working
				hasIndexers = response.Results && Array.isArray(response.Results) && response.Results.length > 0;
				connectionStatus = hasIndexers ? 'configured' : 'no_indexers';
			} else {
				connectionStatus = 'connection_failed';
			}
		} catch {
			connectionStatus = 'connection_failed';
		}
	}

	return json({
		configured: hasConfig,
		url,
		connectionStatus,
		hasIndexers,
		// For UI display purposes
		needsSetup: !hasConfig || connectionStatus === 'no_indexers',
	});
};
