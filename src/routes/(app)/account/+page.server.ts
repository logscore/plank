import { redirect } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const userMedia = mediaDb.list(locals.user.id);

	// Calculate total storage used
	const totalSize = userMedia.reduce((acc, item) => acc + (item.fileSize || 0), 0);

	// Count media by status
	const mediaStats = {
		total: userMedia.length,
		complete: userMedia.filter((m) => m.status === 'complete').length,
		downloading: userMedia.filter((m) => m.status === 'downloading' || m.status === 'added')
			.length,
		error: userMedia.filter((m) => m.status === 'error').length,
	};

	return {
		user: locals.user,
		stats: {
			...mediaStats,
			totalSize,
		},
	};
};
