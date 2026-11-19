import path from "node:path";
import { error, json } from "@sveltejs/kit";
import { requireMediaAccess } from "$lib/server/api-guard";
import { readChunkRequest } from "$lib/server/chunk-upload";
import { isSupportedFormat, SUPPORTED_VIDEO_FORMATS } from "$lib/server/ffmpeg";
import { appendUploadChunk, UPLOAD_FILE_BYTES_MAX } from "$lib/server/media-upload";
import type { RequestHandler } from "./$types";

/** Receive one chunk of a video file. The body is the raw chunk bytes. */
export const PUT: RequestHandler = async ({ locals, params, request, url }) => {
	const { mediaItem, allowedRatings } = requireMediaAccess(locals, params.id);
	// The server cannot check what a file holds, so a limited member cannot upload.
	if (allowedRatings) {
		throw error(403, "Your rating limit blocks uploads");
	}
	if (mediaItem.type === "show") {
		throw error(400, "Upload a file to one episode, not to the whole show");
	}
	const extension = path.extname(url.searchParams.get("name") ?? "").toLowerCase();
	if (!isSupportedFormat(extension)) {
		throw error(400, `Unsupported file type. Supported formats: ${SUPPORTED_VIDEO_FORMATS.join(", ")}`);
	}
	const { chunk, fileSize, offset } = await readChunkRequest(request, url, UPLOAD_FILE_BYTES_MAX);
	const received = await appendUploadChunk(mediaItem.id, extension, fileSize, offset, chunk);
	return json({ received });
};
