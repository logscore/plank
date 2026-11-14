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
	downloadSpeed: number;
	episodeProgress?: Map<number, number>;
	error?: string;
	peers: number;
	progress: number;
	status: "idle" | "initializing" | "downloading" | "finalizing" | "complete" | "error";
	totalSize?: number;
	/** Finalization progress from 0 to 1. Zero unless the status is finalizing. */
	transcodeProgress: number;
}

interface AggregatedStats {
	allComplete: boolean;
	episodeProgress: Map<number, number>;
	errors: string[];
	finalizingCount: number;
	hasDownloading: boolean;
	hasError: boolean;
	hasFinalizing: boolean;
	hasInitializing: boolean;
	totalDownloadSpeed: number;
	totalPeers: number;
	totalProgress: number;
	totalSize: number;
	totalTranscodeProgress: number;
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
		allComplete: true,
		episodeProgress: new Map<number, number>(),
		errors: [],
		finalizingCount: 0,
		hasDownloading: false,
		hasError: false,
		hasFinalizing: false,
		hasInitializing: false,
		totalDownloadSpeed: 0,
		totalPeers: 0,
		totalProgress: 0,
		totalSize: 0,
		totalTranscodeProgress: 0,
	};

	for (const download of downloads) {
		result.totalDownloadSpeed += download.torrent.downloadSpeed;
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
		downloadSpeed: stats.totalDownloadSpeed,
		episodeProgress: stats.episodeProgress.size > 0 ? stats.episodeProgress : undefined,
		error: stats.errors.length > 0 ? stats.errors.join("; ") : undefined,
		peers: stats.totalPeers,
		progress: stats.allComplete ? 1 : overallProgress,
		status,
		totalSize: stats.totalSize,
		transcodeProgress,
	};
}

export function getDownloadStatus(mediaId: string): DownloadStatusResult | null {
	const mediaItem = mediaDb.getById(mediaId);
	const downloadOwnerId = mediaItem ? getDownloadOwnerMediaId(mediaItem) : mediaId;
	const downloads = getDownloadsForMedia(downloadOwnerId);

	if (downloads.length === 0) {
		if (mediaItem?.status === "complete") {
			return {
				downloadSpeed: 0,
				peers: 0,
				progress: 1,
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

		// biome-ignore lint/performance/noAwaitInLoops: polling loop, each wait must finish before the next check
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	return false;
}
