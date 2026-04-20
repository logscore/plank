import { error, fail, redirect } from '@sveltejs/kit';
import { getSettings, updateSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

function parseTrustedGroups(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split(',')
		.map((group) => group.trim())
		.filter((group) => group.length > 0);
}

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
		const prowlarrUrl = formData.get('prowlarrUrl')?.toString() || '';
		const prowlarrApiKey = formData.get('prowlarrApiKey')?.toString() || '';
		const prowlarrMinSeedersStr = formData.get('prowlarrMinSeeders')?.toString();
		const prowlarrTrustedGroupsStr = formData.get('prowlarrTrustedGroups')?.toString();
		const opensubtitlesApiKey = formData.get('opensubtitlesApiKey')?.toString() || '';
		const opensubtitlesUsername = formData.get('opensubtitlesUsername')?.toString() || '';
		const opensubtitlesPassword = formData.get('opensubtitlesPassword')?.toString() || '';

		const prowlarrMinSeeders = prowlarrMinSeedersStr ? Number.parseInt(prowlarrMinSeedersStr, 10) : 5;
		const prowlarrTrustedGroups = parseTrustedGroups(prowlarrTrustedGroupsStr);

		try {
			await updateSettings({
				tmdbApiKey,
				prowlarrUrl,
				prowlarrApiKey,
				prowlarrMinSeeders,
				prowlarrTrustedGroups,
				opensubtitlesApiKey,
				opensubtitlesUsername,
				opensubtitlesPassword,
			});
		} catch (err) {
			console.error('Failed to update settings:', err);
			return fail(500, { success: false, error: 'Failed to update settings' });
		}

		return { success: true };
	},
};
