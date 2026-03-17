import fs from 'node:fs/promises';
import { error, json } from '@sveltejs/kit';
import { requireAuth, requireMediaAccess } from '$lib/server/api-guard';
import { subtitlesDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAuth(locals);

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

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
	requireMediaAccess(locals, params.id);

	const subtitle = subtitlesDb.getById(params.subtitleId);
	if (!subtitle) {
		throw error(404, 'Subtitle not found');
	}

	const { isDefault } = (await request.json()) as { isDefault: boolean };
	subtitlesDb.setDefault(params.subtitleId, subtitle.mediaId, subtitle.episodeId, isDefault);

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireMediaAccess(locals, params.id);

	const subtitle = subtitlesDb.getById(params.subtitleId);
	if (!subtitle) {
		throw error(404, 'Subtitle not found');
	}

	if (subtitle.filePath && (subtitle.source === 'opensubtitles' || subtitle.source === 'manual')) {
		await fs.unlink(subtitle.filePath).catch(() => undefined);
	}

	subtitlesDb.deleteById(params.subtitleId);

	return json({ success: true });
};
