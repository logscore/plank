import { redirect } from '@sveltejs/kit';
import { movies } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const userMovies = movies.list(locals.user.id);

	// Calculate total storage used
	const totalSize = userMovies.reduce((acc, movie) => acc + (movie.fileSize || 0), 0);

	// Count movies by status
	const movieStats = {
		total: userMovies.length,
		complete: userMovies.filter((m) => m.status === 'complete').length,
		downloading: userMovies.filter((m) => m.status === 'downloading' || m.status === 'added')
			.length,
		error: userMovies.filter((m) => m.status === 'error').length,
	};

	return {
		user: locals.user,
		stats: {
			...movieStats,
			totalSize,
		},
	};
};
