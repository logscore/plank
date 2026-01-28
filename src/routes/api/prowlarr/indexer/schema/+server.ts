import { json } from '@sveltejs/kit';
import { getProwlarrIndexerSchemas } from '$lib/server/prowlarr';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const schemas = await getProwlarrIndexerSchemas();
	return json(schemas);
};
