/**
 * Prowlarr Status API
 *
 * Returns configuration status for Prowlarr integration
 */

import { json } from '@sveltejs/kit';
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
	let hasIndexers = false;

	if (hasConfig) {
		try {
			// Test Prowlarr connectivity with a limited movie search
			const testResponse = await fetch(`${url}/api/v1/search?query=tt0080684&type=search&apikey=${apiKey}`, {
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(10_000), // 10 second timeout
			});

			if (testResponse.ok) {
				const response = await testResponse.json();

				// If we get an array, it's working. If it has items, indexers are finding things.
				if (Array.isArray(response)) {
					connectionStatus = 'configured';
					hasIndexers = response.length > 0;

					// If empty, we might want to flag "no_indexers" or just "connected but no results"
					if (response.length === 0) {
						connectionStatus = 'no_indexers';
					}
				} else {
					connectionStatus = 'connection_failed';
				}
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
