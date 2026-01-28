import { redirect } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const settings = await getSettings();

	return {
		settings,
	};
};
