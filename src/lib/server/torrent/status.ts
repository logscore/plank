import { existsSync } from "node:fs";
import { assert } from "$lib/utils";
import { mediaDb } from "../db";
import {
	type ActiveDownload,
	activeDownloads,
	getDownloadOwnerMediaId,
	getDownloadsForMedia,
	resolveEpisodeFileIndex,
} from "./client";

export interface DownloadStatusResult {
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	peers: number;
	status: "idle" | "initializing" | "downloading" | "finalizing" | "complete" | "error";
	error?: string;
	/** Finalization progress from 0 to 1. Zero unless the status is finalizing. */
	transcodeProgress: number;
	episodeProgress?: Map<number, number>;
	activeDownloads?: number;
	totalSize?: number;
}

interface AggregatedStats {
	totalProgress: number;
	totalSize: number;
	totalTranscodeProgress: number;
	finalizingCount: number;
	totalDownloadSpeed: number;
	totalUploadSpeed: number;
	totalPeers: number;
	hasInitializing: boolean;
	hasDownloading: boolean;
	hasFinalizing: boolean;
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
		totalTranscodeProgress: 0,
		finalizingCount: 0,
		totalDownloadSpeed: 0,
		totalUploadSpeed: 0,
		totalPeers: 0,
		hasInitializing: false,
		hasDownloading: false,
		hasFinalizing: false,
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
		result.hasDownloading = result.hasDownloading || download.status === "downloading";
		if (download.status === "finalizing") {
			result.hasFinalizing = true;
			result.totalTranscodeProgress += download.transcodeProgress;
			result.finalizingCount += 1;
		}
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
	if (stats.hasError && !(stats.hasDownloading || stats.hasFinalizing || stats.hasInitializing)) {
		return "error";
	}
	if (stats.hasInitializing) {
		return "initializing";
	}
	// A download that still moves bytes outranks one that is already in ffmpeg.
	if (stats.hasFinalizing && !stats.hasDownloading) {
		return "finalizing";
	}
	return "downloading";
}

function buildDownloadStatus(downloads: ActiveDownload[]): DownloadStatusResult {
	assert(downloads.length > 0, "buildDownloadStatus: downloads must not be empty");
	const stats = aggregateDownloadStats(downloads);
	const overallProgress = stats.totalSize > 0 ? stats.totalProgress / stats.totalSize : 0;
	const status = determineOverallStatus(stats);
	const transcodeProgress =
		status === "finalizing" && stats.finalizingCount > 0 ? stats.totalTranscodeProgress / stats.finalizingCount : 0;
	return {
		progress: stats.allComplete ? 1 : overallProgress,
		downloadSpeed: stats.totalDownloadSpeed,
		uploadSpeed: stats.totalUploadSpeed,
		peers: stats.totalPeers,
		status,
		transcodeProgress,
		error: stats.errors.length > 0 ? stats.errors.join("; ") : undefined,
		episodeProgress: stats.episodeProgress.size > 0 ? stats.episodeProgress : undefined,
		activeDownloads: downloads.length,
		totalSize: stats.totalSize,
	};
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
				transcodeProgress: 0,
			};
		}
		return null;
	}

	return buildDownloadStatus(downloads);
}

export function getDownloadStatusByInfohash(infohash: string): DownloadStatusResult | null {
	const download = activeDownloads.get(infohash);
	return download ? buildDownloadStatus([download]) : null;
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
