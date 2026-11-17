// Builds consistent progress snapshots for movies and episode downloads
// FEATURE: Live progress transport for movie and episode download monitoring

import type { Media } from "$lib/server/db/schema";
import { mediaDb } from "./db";
import { getDownloadStatus } from "./torrent/status";

export const finalizationProgress = new Map<string, number>();

export interface MediaProgressSnapshot {
	downloadSpeed: number;
	fileSize?: number | null;
	peers: number;
	progress: number;
	status: string;
	/** Finalization progress from 0 to 1. Zero unless the status is finalizing. */
	transcodeProgress: number;
}

function getEpisodeKey(mediaItem: Media): number | null {
	if (mediaItem.type !== "episode" || mediaItem.seasonNumber === null || mediaItem.episodeNumber === null) {
		return null;
	}
	return mediaItem.seasonNumber * 100 + mediaItem.episodeNumber;
}

function getEpisodeProgress(mediaItem: Media): number | null {
	const episodeKey = getEpisodeKey(mediaItem);
	if (episodeKey === null) {
		return null;
	}
	return getDownloadStatus(mediaItem.id)?.episodeProgress?.get(episodeKey) ?? null;
}

export function getResolvedProgress(mediaItem: Media): number {
	if (finalizationProgress.has(mediaItem.id) || mediaItem.filePath || mediaItem.status === "complete") {
		return 1;
	}
	const episodeProgress = getEpisodeProgress(mediaItem);
	if (episodeProgress !== null) {
		return episodeProgress;
	}
	return getDownloadStatus(mediaItem.id)?.progress ?? mediaItem.progress ?? 0;
}

export function getResolvedStatus(mediaItem: Media): string {
	if (finalizationProgress.has(mediaItem.id)) {
		return "finalizing";
	}
	if (mediaItem.filePath || mediaItem.status === "complete") {
		return "complete";
	}
	return getDownloadStatus(mediaItem.id)?.status ?? mediaItem.status ?? "pending";
}

function getResolvedFileSize(mediaItem: Media): number | null | undefined {
	if (mediaItem.fileSize) {
		return mediaItem.fileSize;
	}
	if (mediaItem.type === "episode" && mediaItem.parentId && !(mediaItem.magnetLink || mediaItem.infohash)) {
		return null;
	}
	return getDownloadStatus(mediaItem.id)?.totalSize;
}

export function getMediaProgressSnapshot(mediaId: string, organizationId?: string): MediaProgressSnapshot | null {
	const mediaItem = organizationId ? mediaDb.get(mediaId, organizationId) : mediaDb.getById(mediaId);
	if (!mediaItem) {
		return null;
	}
	const downloadStatus = getDownloadStatus(mediaId);
	const status = getResolvedStatus(mediaItem);
	return {
		downloadSpeed: downloadStatus?.downloadSpeed ?? 0,
		fileSize: getResolvedFileSize(mediaItem),
		peers: downloadStatus?.peers ?? 0,
		progress: getResolvedProgress(mediaItem),
		status,
		transcodeProgress: finalizationProgress.get(mediaId) ?? downloadStatus?.transcodeProgress ?? 0,
	};
}
