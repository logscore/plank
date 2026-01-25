import { error, json } from '@sveltejs/kit';
import { and, eq, like } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { media } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const query = url.searchParams.get('q');
	const type = url.searchParams.get('type');

	if (!query || query.length < 2) {
		return json([]);
	}

	try {
		const results = await db.query.media.findMany({
			where: and(
				eq(media.userId, locals.user.id),
				like(media.title, `%${query}%`),
				type ? eq(media.type, type as 'movie' | 'tv') : undefined
			),
			orderBy: (media, { desc }) => [desc(media.addedAt)],
		});

		return json(results);
	} catch (err) {
		console.error('Search failed:', err);
		throw error(500, 'Failed to search library');
	}
};
