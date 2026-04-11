import { error, json, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { config } from '$lib/config';
import { db } from '$lib/server/db/index';
import { member } from '$lib/server/db/schema';
import { testProwlarrConnection } from '$lib/server/prowlarr';
import { testOrganizationStorageSettings } from '$lib/server/storage/storage-settings';

type ConnectionTarget = 'tmdb' | 'opensubtitles' | 'prowlarr' | 'storage';

interface TestConnectionRequest {
	target: ConnectionTarget;
	tmdbApiKey?: string;
	prowlarrUrl?: string;
	prowlarrApiKey?: string;
	opensubtitlesApiKey?: string;
	opensubtitlesUsername?: string;
	opensubtitlesPassword?: string;
	storageEnabled?: boolean;
	storageProvider?: 'local' | 's3';
	storageLocalBasePath?: string;
	storageS3Bucket?: string;
	storageS3Region?: string;
	storageS3AccessKeyId?: string;
	storageS3SecretAccessKey?: string;
	storageS3Endpoint?: string;
	storageS3ForcePathStyle?: boolean;
}

const OPEN_SUBTITLES_BASE_URL = 'https://api.opensubtitles.com/api/v1';
const OPEN_SUBTITLES_USER_AGENT = 'plank-media v0.1.0';

async function canManageStorage(userId: string, organizationId: string | null | undefined): Promise<boolean> {
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

async function testTmdbConnection(apiKey: string | undefined): Promise<{ success: boolean; message: string }> {
	if (!apiKey?.trim()) {
		return { success: false, message: 'API key is required' };
	}
	try {
		const response = await fetch(
			`${config.tmdb.baseUrl}/configuration?api_key=${encodeURIComponent(apiKey.trim())}`
		);
		if (response.ok) {
			return { success: true, message: 'Connection successful' };
		}
		return { success: false, message: `Request failed with status ${response.status}` };
	} catch (err) {
		return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
	}
}

async function testOpenSubtitlesConnection(
	apiKey: string | undefined,
	username: string | undefined,
	password: string | undefined
): Promise<{ success: boolean; message: string }> {
	if (!apiKey?.trim()) {
		return { success: false, message: 'API key is required' };
	}

	const headers = {
		'Api-Key': apiKey.trim(),
		'Content-Type': 'application/json',
		'User-Agent': OPEN_SUBTITLES_USER_AGENT,
	};

	try {
		if (username?.trim() && password?.trim()) {
			const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/login`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ username: username.trim(), password: password.trim() }),
			});
			if (response.ok) {
				return { success: true, message: 'Connection successful' };
			}
			return { success: false, message: `Login failed with status ${response.status}` };
		}

		const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/subtitles?query=test&languages=en`, {
			headers,
		});
		if (response.ok) {
			return { success: true, message: 'Connection successful' };
		}
		return { success: false, message: `Request failed with status ${response.status}` };
	} catch (err) {
		return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
	}
}

export const POST = async (event: RequestEvent) => {
	if (!event.locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = (await event.request.json()) as TestConnectionRequest;

	if (body.target === 'tmdb') {
		return json(await testTmdbConnection(body.tmdbApiKey));
	}

	if (body.target === 'opensubtitles') {
		return json(
			await testOpenSubtitlesConnection(
				body.opensubtitlesApiKey,
				body.opensubtitlesUsername,
				body.opensubtitlesPassword
			)
		);
	}

	if (body.target === 'prowlarr') {
		const result = await testProwlarrConnection(body.prowlarrUrl, body.prowlarrApiKey);
		return json({
			success: result.success,
			message: result.success ? 'Connection successful' : (result.message ?? 'Connection failed'),
		});
	}

	if (body.target === 'storage') {
		const organizationId = event.locals.session?.activeOrganizationId ?? null;
		if (!organizationId) {
			throw error(400, 'No active organization');
		}
		if (!(await canManageStorage(event.locals.user.id, organizationId))) {
			throw error(403, 'Forbidden');
		}
		try {
			await testOrganizationStorageSettings({
				organizationId,
				enabled: body.storageEnabled === true,
				provider: body.storageProvider ?? 'local',
				localBasePath: body.storageLocalBasePath,
				s3Bucket: body.storageS3Bucket,
				s3Region: body.storageS3Region,
				s3AccessKeyId: body.storageS3AccessKeyId,
				s3SecretAccessKey: body.storageS3SecretAccessKey,
				s3Endpoint: body.storageS3Endpoint,
				s3ForcePathStyle: body.storageS3ForcePathStyle,
			});
			return json({ success: true, message: 'Connection successful' });
		} catch (err) {
			return json(
				{ success: false, message: err instanceof Error ? err.message : 'Connection failed' },
				{ status: 400 }
			);
		}
	}

	throw error(400, 'Invalid target');
};
