import { json } from '@sveltejs/kit';
import { addProwlarrIndexer, deleteProwlarrIndexer, getProwlarrIndexers } from '$lib/server/prowlarr';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const indexers = await getProwlarrIndexers();
	return json(indexers);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const data = await request.json();
	const success = await addProwlarrIndexer(data);

	if (success) {
		return json({ success: true });
	}
	return json({ error: 'Failed to add indexer' }, { status: 500 });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const id = url.searchParams.get('id');
	if (!id) {
		return json({ error: 'Missing id' }, { status: 400 });
	}

	const success = await deleteProwlarrIndexer(Number.parseInt(id, 10));

	if (success) {
		return json({ success: true });
	}
	return json({ error: 'Failed to delete indexer' }, { status: 500 });
};
