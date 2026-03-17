import { error, json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { subtitlesDb } from '$lib/server/db';
import { downloadSubtitle, getIso2Code, getLanguageName } from '$lib/server/opensubtitles';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	requireMediaAccess(locals, params.id);

	const body = await request.json();
	const { fileId, language, episodeId } = body as {
		fileId: number;
		language: string;
		episodeId?: string;
	};

	if (!(fileId && language)) {
		throw error(400, 'fileId and language are required');
	}

	try {
		const { filePath, fileName } = await downloadSubtitle(fileId, params.id);

		const subtitle = subtitlesDb.create({
			mediaId: params.id,
			episodeId: episodeId ?? null,
			language: getIso2Code(language),
			label: getLanguageName(language),
			source: 'opensubtitles',
			format: 'vtt',
			filePath,
			streamIndex: null,
			isDefault: false,
			isForced: false,
		});

		return json({
			id: subtitle.id,
			mediaId: subtitle.mediaId,
			episodeId: subtitle.episodeId,
			language: subtitle.language,
			label: subtitle.label,
			source: subtitle.source,
			isDefault: subtitle.isDefault,
			isForced: subtitle.isForced,
			src: `/api/media/${params.id}/subtitles/${subtitle.id}`,
			fileName,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Download failed';
		throw error(500, message);
	}
};
