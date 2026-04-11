import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { member } from '$lib/server/db/schema';
import { getSettings, updateSettings } from '$lib/server/settings';
import { getOrganizationStorageSettings, saveOrganizationStorageSettings } from '$lib/server/storage/storage-settings';
import type { Actions, PageServerLoad } from './$types';

const EMPTY_STORAGE_SETTINGS = {
	enabled: false,
	provider: 'local' as const,
	local: { basePath: '' },
	s3: {
		bucket: '',
		region: '',
		accessKeyId: '',
		secretAccessKey: '',
		endpoint: '',
		forcePathStyle: false,
	},
};

async function getStorageAccess(userId: string, organizationId: string | null | undefined): Promise<boolean> {
	if (!organizationId) {
		return false;
	}
	const membership = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
		.get();
	return membership?.role === 'owner' || membership?.role === 'admin';
}

function parseTrustedGroups(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split(',')
		.map((group) => group.trim())
		.filter((group) => group.length > 0);
}

function parseStorageForm(formData: FormData) {
	return {
		enabled: formData.get('storageEnabled') === 'on',
		provider: (formData.get('storageProvider')?.toString() || 'local') as 'local' | 's3',
		localBasePath: formData.get('storageLocalBasePath')?.toString() || '',
		s3Bucket: formData.get('storageS3Bucket')?.toString() || '',
		s3Region: formData.get('storageS3Region')?.toString() || '',
		s3AccessKeyId: formData.get('storageS3AccessKeyId')?.toString() || '',
		s3SecretAccessKey: formData.get('storageS3SecretAccessKey')?.toString() || '',
		s3Endpoint: formData.get('storageS3Endpoint')?.toString() || '',
		s3ForcePathStyle: formData.get('storageS3ForcePathStyle') === 'on',
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const settings = await getSettings();
	const activeOrganizationId = locals.session?.activeOrganizationId ?? null;
	const canManageStorage = await getStorageAccess(locals.user.id, activeOrganizationId);
	const storageSettings = activeOrganizationId
		? await getOrganizationStorageSettings(activeOrganizationId)
		: EMPTY_STORAGE_SETTINGS;

	return {
		settings,
		activeOrganizationId,
		canManageStorage,
		storageSettings,
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
		const activeOrganizationId = locals.session?.activeOrganizationId ?? null;
		const canManageStorage = await getStorageAccess(locals.user.id, activeOrganizationId);
		const storageForm = parseStorageForm(formData);

		const prowlarrMinSeeders = prowlarrMinSeedersStr ? Number.parseInt(prowlarrMinSeedersStr, 10) : 5;
		const prowlarrTrustedGroups = parseTrustedGroups(prowlarrTrustedGroupsStr);

		if (storageForm.enabled && !activeOrganizationId) {
			return fail(400, { success: false, error: 'Select an organization before configuring storage' });
		}

		if (storageForm.enabled && !canManageStorage) {
			return fail(403, { success: false, error: 'Only organization owners and admins can update storage' });
		}

		if (activeOrganizationId && canManageStorage) {
			const storageResult = await saveOrganizationStorageSettings({
				organizationId: activeOrganizationId,
				...storageForm,
			});

			if (!storageResult.success) {
				return fail(400, {
					success: false,
					error: 'Storage settings are invalid',
					fieldErrors: storageResult.fieldErrors,
				});
			}
		}

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
