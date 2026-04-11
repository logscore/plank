import { error, json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { subtitlesDb } from '$lib/server/db';
import { deleteStoredFile, readStoredFile } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);

	const subtitle = subtitlesDb.getById(params.subtitleId);
	if (!(subtitle?.filePath && subtitle.mediaId === params.id)) {
		throw error(404, 'Subtitle not found');
	}

	let content: string;
	try {
		content = (await readStoredFile(subtitle.filePath, mediaItem.organizationId)).toString('utf-8');
	} catch {
		throw error(404, 'Subtitle file not found');
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
	subtitlesDb.setDefault(params.subtitleId, subtitle.mediaId, isDefault);

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);

	const subtitle = subtitlesDb.getById(params.subtitleId);
	if (!(subtitle && subtitle.mediaId === params.id)) {
		throw error(404, 'Subtitle not found');
	}

	if (subtitle.filePath && (subtitle.source === 'opensubtitles' || subtitle.source === 'manual')) {
		await deleteStoredFile(subtitle.filePath, mediaItem.organizationId).catch(() => undefined);
	}

	subtitlesDb.deleteById(params.subtitleId);

	return json({ success: true });
};
