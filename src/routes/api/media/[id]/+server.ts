import { requireMediaAccess } from "$lib/server/api-guard";
import { mediaDb } from "$lib/server/db";
import { cancelDownload } from "$lib/server/torrent/download";
import { deleteMediaFiles } from "$lib/server/torrent/finalize";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { organizationId } = requireMediaAccess(locals, params.id);
	const mediaId = params.id;

	await cancelDownload(mediaId);
	await deleteMediaFiles(mediaId);
	mediaDb.delete(mediaId, organizationId);

	return new Response(null, { status: 204 });
};
