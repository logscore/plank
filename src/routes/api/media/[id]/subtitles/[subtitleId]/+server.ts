import fs from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { subtitlesDb } from '$lib/server/db';
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
