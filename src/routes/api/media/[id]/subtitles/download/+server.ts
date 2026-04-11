import { error, json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { subtitlesDb } from '$lib/server/db';
import { downloadSubtitle, getIso2Code, getLanguageName } from '$lib/server/opensubtitles';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	const { fileId, language } = (await request.json()) as { fileId: number; language: string };
	if (!(fileId && language)) {
		throw error(400, 'fileId and language are required');
	}
	try {
		const { filePath, fileName } = await downloadSubtitle(fileId, params.id, mediaItem.organizationId);
		const subtitle = subtitlesDb.create({
			mediaId: params.id,
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
			language: subtitle.language,
			label: subtitle.label,
			source: subtitle.source,
			isDefault: subtitle.isDefault,
			isForced: subtitle.isForced,
			src: `/api/media/${params.id}/subtitles/${subtitle.id}`,
			fileName,
		});
	} catch (errorValue) {
		const message = errorValue instanceof Error ? errorValue.message : 'Download failed';
		throw error(500, message);
	}
};
