import type { FetchError, OpenSubtitleResult } from "$lib/types";
export async function searchOpenSubtitles(
	mediaId: string,
	options?: {
		languages?: string;
		seasonNumber?: number;
		episodeNumber?: number | null;
	}
): Promise<OpenSubtitleResult[]> {
	const params = new URLSearchParams();
	if (options?.languages) {
		params.set("languages", options.languages);
	}
	if (options?.seasonNumber !== undefined) {
		params.set("seasonNumber", String(options.seasonNumber));
	}
	if (options?.episodeNumber != null) {
		params.set("episodeNumber", String(options.episodeNumber));
	}
	const response = await fetch(`/api/media/${mediaId}/subtitles/search?${params.toString()}`);
	if (!response.ok) {
		const err: FetchError = new Error("Failed to search subtitles");
		err.status = response.status;
		throw err;
	}
	return response.json();
}
