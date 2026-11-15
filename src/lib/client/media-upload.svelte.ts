import { uploadMediaFile } from "$lib/data/media";

interface MediaUpload {
	error: string;
	progress: number | null;
}

// Uploads keep running when their dialog closes or the user opens another title.
const uploads = $state<Record<string, MediaUpload | undefined>>({});

export function getMediaUpload(mediaId: string | undefined): MediaUpload | undefined {
	return mediaId ? uploads[mediaId] : undefined;
}

export async function startMediaUpload(mediaId: string, file: File): Promise<void> {
	const activeUpload = uploads[mediaId];
	if (activeUpload && activeUpload.progress !== null) {
		throw new Error("This title already has an upload in progress");
	}
	const upload = $state<MediaUpload>({ error: "", progress: 0 });
	uploads[mediaId] = upload;
	try {
		await uploadMediaFile(mediaId, file, (progress) => {
			upload.progress = progress;
		});
	} catch (error) {
		upload.error = error instanceof Error ? error.message : "Upload failed";
		throw error;
	} finally {
		upload.progress = null;
	}
}
