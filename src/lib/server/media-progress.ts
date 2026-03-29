// Builds consistent progress snapshots for movies and episode downloads
// FEATURE: Live progress transport for movie and episode download monitoring

import { isTerminalProgressStatus } from '$lib/progress-status';
import type { Media } from '$lib/server/db/schema';
import { mediaDb } from './db';
import { getDownloadStatus, isDownloadActive } from './torrent';

export interface MediaProgressSnapshot {
	status: string;
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	peers: number;
	isActive: boolean;
	filePath: string | null;
	error?: string;
	fileSize?: number | null;
}

function getEpisodeKey(mediaItem: Media): number | null {
	if (mediaItem.type !== 'episode' || mediaItem.seasonNumber === null || mediaItem.episodeNumber === null) {
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

function getResolvedProgress(mediaItem: Media): number {
	if (mediaItem.filePath || mediaItem.status === 'complete') {
		return 1;
	}
	const episodeProgress = getEpisodeProgress(mediaItem);
	if (episodeProgress !== null) {
		return episodeProgress;
	}
	return getDownloadStatus(mediaItem.id)?.progress ?? mediaItem.progress ?? 0;
}

function getResolvedStatus(mediaItem: Media): string {
	if (mediaItem.filePath || mediaItem.status === 'complete') {
		return 'complete';
	}
	return getDownloadStatus(mediaItem.id)?.status ?? mediaItem.status ?? 'pending';
}

function getResolvedFileSize(mediaItem: Media): number | null | undefined {
	if (mediaItem.fileSize) {
		return mediaItem.fileSize;
	}
	if (mediaItem.type === 'episode' && mediaItem.parentId && !(mediaItem.magnetLink || mediaItem.infohash)) {
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
	const isActive = isTerminalProgressStatus(status) ? false : isDownloadActive(mediaId);
	return {
		status,
		progress: getResolvedProgress(mediaItem),
		downloadSpeed: downloadStatus?.downloadSpeed ?? 0,
		uploadSpeed: downloadStatus?.uploadSpeed ?? 0,
		peers: downloadStatus?.peers ?? 0,
		isActive,
		filePath: mediaItem.filePath,
		error: downloadStatus?.error,
		fileSize: getResolvedFileSize(mediaItem),
	};
}
