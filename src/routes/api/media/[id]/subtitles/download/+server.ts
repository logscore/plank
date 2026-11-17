import { error, json } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { subtitlesDb } from "$lib/server/db";
import { downloadSubtitle, getIso2Code, getLanguageName } from "$lib/server/opensubtitles";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	const { fileId, language } = (await request.json()) as { fileId: number; language: string };
	if (!(fileId && language)) {
		throw error(400, "fileId and language are required");
	}
	try {
		const { filePath } = await downloadSubtitle(fileId, mediaItem, language);
		const subtitle = subtitlesDb.create({
			filePath,
			label: getLanguageName(language),
			language: getIso2Code(language),
			mediaId: params.id,
			source: "opensubtitles",
		});
		return json({
			id: subtitle.id,
			label: subtitle.label,
			language: subtitle.language,
			mediaId: subtitle.mediaId,
			source: subtitle.source,
			src: `/api/media/${params.id}/subtitles/${subtitle.id}`,
		});
	} catch (errorValue) {
		const message = errorValue instanceof Error ? errorValue.message : "Download failed";
		throw error(500, message);
	}
};
