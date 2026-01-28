import { json } from '@sveltejs/kit';
import { testProwlarrConnection } from '$lib/server/prowlarr';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { url, apiKey } = await request.json();
	const result = await testProwlarrConnection(url, apiKey);

	return json(result);
};
