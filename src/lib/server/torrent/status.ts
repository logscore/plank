import { existsSync } from "node:fs";
import { mediaDb } from "../db";
import { type ActiveDownload, getDownloadOwnerMediaId, getDownloadsForMedia, resolveEpisodeFileIndex } from "./client";

export interface DownloadStatusResult {
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	peers: number;
	status: "idle" | "initializing" | "downloading" | "complete" | "error";
	error?: string;
	episodeProgress?: Map<number, number>;
	activeDownloads?: number;
	totalSize?: number;
}

interface AggregatedStats {
	totalProgress: number;
	totalSize: number;
	totalDownloadSpeed: number;
	totalUploadSpeed: number;
	totalPeers: number;
	hasInitializing: boolean;
	hasDownloading: boolean;
	hasError: boolean;
	allComplete: boolean;
	errors: string[];
	episodeProgress: Map<number, number>;
}

function collectEpisodeProgress(download: ActiveDownload, episodeProgress: Map<number, number>): void {
	if (download.mediaType !== "show") {
		return;
	}
	for (const [episodeKey, fileIndex] of download.episodeMapping.entries()) {
		const file = download.videoFiles[fileIndex];
		if (file) {
			episodeProgress.set(episodeKey, file.progress);
		}
	}
}

function aggregateDownloadStats(downloads: ActiveDownload[]): AggregatedStats {
	const result: AggregatedStats = {
		totalProgress: 0,
		totalSize: 0,
		totalDownloadSpeed: 0,
		totalUploadSpeed: 0,
		totalPeers: 0,
		hasInitializing: false,
		hasDownloading: false,
		hasError: false,
		allComplete: true,
		errors: [],
		episodeProgress: new Map<number, number>(),
	};

	for (const download of downloads) {
		result.totalDownloadSpeed += download.torrent.downloadSpeed;
		result.totalUploadSpeed += download.torrent.uploadSpeed;
		result.totalPeers += download.torrent.numPeers;
		result.totalSize += download.totalSize;
		result.totalProgress += download.progress * download.totalSize;

		result.hasInitializing = result.hasInitializing || download.status === "initializing";
		result.hasDownloading =
			result.hasDownloading || download.status === "downloading" || download.status === "finalizing";
		result.hasError = result.hasError || download.status === "error";
		result.allComplete = result.allComplete && download.status === "complete";

		if (download.status === "error" && download.error) {
			result.errors.push(download.error);
		}

		collectEpisodeProgress(download, result.episodeProgress);
	}

	return result;
}

function determineOverallStatus(stats: AggregatedStats): DownloadStatusResult["status"] {
	if (stats.allComplete) {
		return "complete";
	}
	if (stats.hasError && !stats.hasDownloading && !stats.hasInitializing) {
		return "error";
	}
	if (stats.hasInitializing) {
		return "initializing";
	}
	return "downloading";
}

export function getDownloadStatus(mediaId: string): DownloadStatusResult | null {
	const mediaItem = mediaDb.getById(mediaId);
	const downloadOwnerId = mediaItem ? getDownloadOwnerMediaId(mediaItem) : mediaId;
	const downloads = getDownloadsForMedia(downloadOwnerId);

	if (downloads.length === 0) {
		if (mediaItem?.status === "complete") {
			return {
				progress: 1,
				downloadSpeed: 0,
				uploadSpeed: 0,
				peers: 0,
				status: "complete",
			};
		}
		return null;
	}

	const stats = aggregateDownloadStats(downloads);
	const overallProgress = stats.totalSize > 0 ? stats.totalProgress / stats.totalSize : 0;
	const status = determineOverallStatus(stats);

	return {
		progress: stats.allComplete ? 1 : overallProgress,
		downloadSpeed: stats.totalDownloadSpeed,
		uploadSpeed: stats.totalUploadSpeed,
		peers: stats.totalPeers,
		status,
		error: stats.errors.length > 0 ? stats.errors.join("; ") : undefined,
		episodeProgress: stats.episodeProgress.size > 0 ? stats.episodeProgress : undefined,
		activeDownloads: downloads.length,
		totalSize: stats.totalSize,
	};
}

export function isDownloadActive(mediaId: string): boolean {
	const mediaItem = mediaDb.getById(mediaId);
	const downloadOwnerId = mediaItem ? getDownloadOwnerMediaId(mediaItem) : mediaId;
	const downloads = getDownloadsForMedia(downloadOwnerId);
	return downloads.length > 0;
}

function isDownloadReadyForStreaming(download: ActiveDownload | undefined, fileIndex?: number): boolean {
	if (!download) {
		return false;
	}

	if (download.mediaType === "show" && fileIndex !== undefined) {
		const videoFile = download.videoFiles[fileIndex];
		return Boolean(
			videoFile &&
				download.status !== "initializing" &&
				(videoFile.progress >= 0.02 || download.status === "complete")
		);
	}

	if (download.videoFile) {
		return download.status !== "initializing" && (download.progress >= 0.02 || download.status === "complete");
	}

	return false;
}

function isLibraryFileReady(mediaId: string): boolean {
	const mediaItem = mediaDb.getById(mediaId);
	if (mediaItem?.filePath && existsSync(mediaItem.filePath)) {
		return true;
	}
	return false;
}

export async function waitForVideoReady(mediaId: string, fileIndex?: number, timeoutMs = 30_000): Promise<boolean> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const mediaItem = mediaDb.getById(mediaId);
		const downloadOwnerId = mediaItem ? getDownloadOwnerMediaId(mediaItem) : mediaId;
		const downloads = getDownloadsForMedia(downloadOwnerId);
		const resolvedFileIndex = mediaItem ? (resolveEpisodeFileIndex(mediaItem, downloads) ?? fileIndex) : fileIndex;
		const readyDownload = downloads.find((download) => isDownloadReadyForStreaming(download, resolvedFileIndex));

		if (readyDownload) {
			return true;
		}

		if (isLibraryFileReady(mediaId)) {
			return true;
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	return false;
}
