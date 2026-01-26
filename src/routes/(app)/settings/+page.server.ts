import { error, redirect } from '@sveltejs/kit';
import { getSettings, updateSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const settings = await getSettings();

	return {
		settings,
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}

		const formData = await request.formData();
		const tmdbApiKey = formData.get('tmdbApiKey')?.toString() || '';
		const tmdbLanguage = formData.get('tmdbLanguage')?.toString() || 'en-US';
		const jackettUrl = formData.get('jackettUrl')?.toString() || '';
		const jackettApiKey = formData.get('jackettApiKey')?.toString() || '';
		const jackettMinSeedersStr = formData.get('jackettMinSeeders')?.toString();
		const jackettTrustedGroupsStr = formData.get('jackettTrustedGroups')?.toString();

		const jackettMinSeeders = jackettMinSeedersStr ? Number.parseInt(jackettMinSeedersStr, 10) : 5;

		let jackettTrustedGroups: string[] = [];
		if (jackettTrustedGroupsStr) {
			// Handle comma-separated list
			jackettTrustedGroups = jackettTrustedGroupsStr
				.split(',')
				.map((g) => g.trim())
				.filter((g) => g.length > 0);
		}

		try {
			await updateSettings({
				tmdbApiKey,
				tmdbLanguage,
				jackettUrl,
				jackettApiKey,
				jackettMinSeeders,
				jackettTrustedGroups,
			});
		} catch (err) {
			console.error('Failed to update settings:', err);
			return { success: false, error: 'Failed to update settings' };
		}

		return { success: true };
	},
};
