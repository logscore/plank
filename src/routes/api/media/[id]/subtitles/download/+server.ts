import { error, json } from '@sveltejs/kit';
import { mediaDb, subtitlesDb } from '$lib/server/db';
import { downloadSubtitle, getIso2Code, getLanguageName } from '$lib/server/opensubtitles';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, request }) => {
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

		// Store in database
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
