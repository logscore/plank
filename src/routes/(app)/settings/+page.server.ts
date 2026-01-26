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
		const prowlarrUrl = formData.get('prowlarrUrl')?.toString() || '';
		const prowlarrApiKey = formData.get('prowlarrApiKey')?.toString() || '';
		const prowlarrMinSeedersStr = formData.get('prowlarrMinSeeders')?.toString();
		const prowlarrTrustedGroupsStr = formData.get('prowlarrTrustedGroups')?.toString();

		const prowlarrMinSeeders = prowlarrMinSeedersStr ? Number.parseInt(prowlarrMinSeedersStr, 10) : 5;

		let prowlarrTrustedGroups: string[] = [];
		if (prowlarrTrustedGroupsStr) {
			// Handle comma-separated list
			prowlarrTrustedGroups = prowlarrTrustedGroupsStr
				.split(',')
				.map((g) => g.trim())
				.filter((g) => g.length > 0);
		}

		try {
			await updateSettings({
				tmdbApiKey,
				tmdbLanguage,
				prowlarrUrl,
				prowlarrApiKey,
				prowlarrMinSeeders,
				prowlarrTrustedGroups,
			});
		} catch (err) {
			console.error('Failed to update settings:', err);
			return { success: false, error: 'Failed to update settings' };
		}

		return { success: true };
	},
};
