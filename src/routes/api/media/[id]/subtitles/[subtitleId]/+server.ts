import fs from 'node:fs/promises';
import { error, json } from '@sveltejs/kit';
import { mediaDb, subtitlesDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const subtitle = subtitlesDb.getById(params.subtitleId);
	if (!subtitle?.filePath) {
		throw error(404, 'Subtitle not found');
	}

	let content: string;
	try {
		content = await fs.readFile(subtitle.filePath, 'utf-8');
	} catch {
		throw error(404, 'Subtitle file not found on disk');
	}

	return new Response(content, {
		headers: {
			'Content-Type': 'text/vtt; charset=utf-8',
			'Cache-Control': 'private, max-age=86400',
		},
	});
};

/** Set a subtitle as the default (and unset all others for the same media/episode) */
export const PATCH: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const mediaItem = mediaDb.get(params.id, organizationId);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	const subtitle = subtitlesDb.getById(params.subtitleId);
	if (!subtitle) {
		throw error(404, 'Subtitle not found');
	}

	const body = await request.json();
	const { isDefault } = body as { isDefault: boolean };

	subtitlesDb.setDefault(params.subtitleId, subtitle.mediaId, subtitle.episodeId, isDefault);

	return json({ success: true });
};

/** Delete a subtitle */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const mediaItem = mediaDb.get(params.id, organizationId);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	const subtitle = subtitlesDb.getById(params.subtitleId);
	if (!subtitle) {
		throw error(404, 'Subtitle not found');
	}

	// Delete the file from disk if it's an opensubtitles or manual source
	if (subtitle.filePath && (subtitle.source === 'opensubtitles' || subtitle.source === 'manual')) {
		await fs.unlink(subtitle.filePath).catch(() => undefined);
	}

	subtitlesDb.deleteById(params.subtitleId);

	return json({ success: true });
};
