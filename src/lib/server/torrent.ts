import { createReadStream, existsSync, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import parseTorrent from 'parse-torrent';
import ptt from 'parse-torrent-title';
import { config } from '$lib/config';
import type { MediaType } from '$lib/types';
import { downloadsDb, mediaDb, seasonsDb } from './db';
import { isSupportedFormat, SUPPORTED_VIDEO_FORMATS } from './ffmpeg';
import {
	getEpisodeLibraryPath,
	getMovieLibraryRoot,
	getSeasonLibraryDirectory,
	getShowLibraryRoot,
} from './library-paths';
import { parseMagnet } from './magnet';
import { buildMovieFileName } from './media-naming';
import { discoverSubtitles } from './subtitles';
import { searchMovie, searchTVShow } from './tmdb';
import { finalizeMediaToLibrary } from './transcoder';

const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt', '.sub'];

// WebTorrent types
interface TorrentFile {
	name: string;
	path: string;
	length: number;
	downloaded: number;
	progress: number;
	select(): void;
	deselect(): void;
	createReadStream(opts?: { start?: number; end?: number }): Readable;
}

interface Torrent {
	files: TorrentFile[];
	infoHash: string;
	magnetURI: string;
	name: string;
	path: string;
	progress: number;
	downloaded: number;
	uploaded: number;
	downloadSpeed: number;
	uploadSpeed: number;
	numPeers: number;
	done: boolean;
	ready: boolean;
	paused: boolean;
	destroy(opts?: { destroyStore?: boolean }, callback?: () => void): void;
	on(event: 'done' | 'metadata' | 'ready', callback: () => void): void;
	on(event: 'upload' | 'download', callback: (bytes: number) => void): void;
	on(event: 'wire', callback: (wire: unknown) => void): void;
	on(event: 'noPeers', callback: (announceType: string) => void): void;
	on(event: 'warning' | 'error', callback: (err: Error) => void): void;
	on(event: string, callback: (...args: unknown[]) => void): void;
	emit(event: string, ...args: unknown[]): boolean;
}

interface WebTorrentClient {
	add(
		torrentId: string,
		opts?: { path?: string; announce?: string[] },
		callback?: (torrent: Torrent) => void
	): Torrent;
	remove(torrentId: string, opts?: { destroyStore?: boolean }, callback?: () => void): void;
	get(torrentId: string): Torrent | null;
	destroy(callback?: () => void): void;
	torrents: Torrent[];
	downloadSpeed: number;
	uploadSpeed: number;
	progress: number;
	ratio: number;
}

interface ActiveDownload {
	mediaId: string;
	infohash: string;
	mediaType: MediaType;
	torrent: Torrent;
	videoFile: TorrentFile | null; // Single file for movies
	videoFiles: TorrentFile[]; // Multiple files for TV shows
	subtitleFiles: TorrentFile[]; // Subtitle files (.srt, .ass, etc.)
	selectedFileIndex: number | null; // Currently selected file for streaming
	episodeMapping: Map<number, number>; // episodeKey (S*100+E) -> fileIndex
	progress: number;
	status: 'initializing' | 'downloading' | 'finalizing' | 'complete' | 'error';
	activeStreams: number;
	totalSize: number;
	error?: string;
}

// Store active downloads keyed by infohash (allows multiple downloads per media)
const activeDownloads = new Map<string, ActiveDownload>();

// Pending download promises keyed by infohash (prevents duplicate starts of same torrent)
const pendingDownloads = new Map<string, Promise<void>>();

/** Get all active downloads for a media item */
function getDownloadsForMedia(mediaId: string): ActiveDownload[] {
	const downloads: ActiveDownload[] = [];
	for (const download of activeDownloads.values()) {
		if (download.mediaId === mediaId) {
			downloads.push(download);
		}
	}
	return downloads;
}

function getDownloadOwnerMediaId(mediaItem: {
	id: string;
	type: MediaType;
	parentId: string | null;
	magnetLink?: string | null;
	infohash?: string | null;
}): string {
	if (mediaItem.type === 'episode' && mediaItem.parentId && !(mediaItem.magnetLink || mediaItem.infohash)) {
		return mediaItem.parentId;
	}
	return mediaItem.id;
}

function getEpisodeKey(mediaItem: { seasonNumber: number | null; episodeNumber: number | null }): number | null {
	if (mediaItem.seasonNumber === null || mediaItem.episodeNumber === null) {
		return null;
	}
	return mediaItem.seasonNumber * 100 + mediaItem.episodeNumber;
}

function resolveEpisodeFileIndex(
	mediaItem: {
		type: MediaType;
		fileIndex: number | null;
		seasonNumber: number | null;
		episodeNumber: number | null;
	},
	downloads: ActiveDownload[]
): number | undefined {
	if (mediaItem.type !== 'episode') {
		return mediaItem.fileIndex ?? undefined;
	}
	if (mediaItem.fileIndex !== null) {
		return mediaItem.fileIndex;
	}
	const episodeKey = getEpisodeKey(mediaItem);
	if (episodeKey === null) {
		return undefined;
	}
	return downloads
		.find((download) => download.mediaType === 'show' && download.episodeMapping.has(episodeKey))
		?.episodeMapping.get(episodeKey);
}

// Singleton WebTorrent client
let client: WebTorrentClient | null = null;

// Minimum file size to consider as main video (50MB)
const MIN_VIDEO_SIZE = 50 * 1024 * 1024;

// Public trackers for better peer discovery
const TRACKERS = [
	'udp://tracker.opentrackr.org:1337/announce',
	'udp://open.tracker.cl:1337/announce',
	'udp://tracker.openbittorrent.com:6969/announce',
	'udp://open.stealth.si:80/announce',
	'udp://tracker.torrent.eu.org:451/announce',
	'udp://exodus.desync.com:6969/announce',
	'udp://tracker.moeking.me:6969/announce',
	'udp://explodie.org:6969/announce',
	'udp://tracker.dler.org:6969/announce',
	'udp://tracker.theoks.net:6969/announce',
	'http://tracker.openbittorrent.com:80/announce',
	'http://tracker.opentrackr.org:1337/announce',
];

// Regex patterns for episode parsing
const SXXEXX_PATTERN = /S(\d{1,2})E(\d{1,2})/i;
const NXNN_PATTERN = /(\d{1,2})x(\d{1,2})/i;

async function getClient(): Promise<WebTorrentClient> {
	if (!client) {
		// Suppress expected 'utp-native not found' warning during WebTorrent import
		const originalError = console.error;
		console.error = (...args: unknown[]) => {
			if (typeof args[0] === 'string' && args[0].includes('uTP not supported')) {
				return;
			}
			originalError.apply(console, args);
		};

		const WebTorrent = await import('webtorrent');
		client = new WebTorrent.default({
			maxConns: 100,
			downloadLimit: -1,
			uploadLimit: -1,
		}) as unknown as WebTorrentClient;

		console.error = originalError;

		// Add global error handler
		(client as unknown as { on: (event: string, handler: (err: Error) => void) => void }).on(
			'error',
			(err: Error) => {
				console.error('[WebTorrent] Global client error:', err);
			}
		);

		// console.log('[WebTorrent] Client initialized successfully');
	}
	return client;
}

function getMimeType(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase();
	const mimeTypes: Record<string, string> = {
		'.mp4': 'video/mp4',
		'.mkv': 'video/x-matroska',
		'.webm': 'video/webm',
		'.avi': 'video/x-msvideo',
		'.mov': 'video/quicktime',
		'.m4v': 'video/x-m4v',
	};
	return mimeTypes[ext] || 'application/octet-stream';
}

function findVideoFile(files: TorrentFile[]): TorrentFile | null {
	// Filter to supported video files that meet minimum size requirement
	const videoFiles = files
		.filter((f) => isSupportedFormat(f.name) && f.length >= MIN_VIDEO_SIZE)
		.sort((a, b) => b.length - a.length);

	if (videoFiles.length > 0) {
		return videoFiles[0];
	}

	// Fallback: get any supported video file regardless of size
	const anyVideo = files.filter((f) => isSupportedFormat(f.name)).sort((a, b) => b.length - a.length)[0];

	return anyVideo || null;
}

function findVideoFiles(files: TorrentFile[]): TorrentFile[] {
	// Filter to supported video files that meet minimum size requirement
	const videoFiles = files
		.filter((f) => isSupportedFormat(f.name) && f.length >= MIN_VIDEO_SIZE)
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

	if (videoFiles.length > 0) {
		return videoFiles;
	}

	// Fallback: get any supported video files regardless of size
	return files
		.filter((f) => isSupportedFormat(f.name))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function findSubtitleFiles(files: TorrentFile[]): TorrentFile[] {
	return files.filter((f) => {
		const ext = path.extname(f.name).toLowerCase();
		return SUBTITLE_EXTENSIONS.includes(ext);
	});
}

async function ensureDirectories(): Promise<void> {
	await fs.mkdir(config.paths.temp, { recursive: true });
	await fs.mkdir(config.paths.library, { recursive: true });
}

/**
 * Map video files to episodes using filename parsing
 */
function mapFilesToEpisodes(files: TorrentFile[], defaultSeason?: number): Map<number, number> {
	const mapping = new Map<number, number>();

	for (const [index, file] of files.entries()) {
		const parsed = ptt.parse(file.name);

		if (parsed.season !== undefined && parsed.episode !== undefined) {
			// Standard S01E01 format
			const episodeKey = parsed.season * 100 + parsed.episode;
			mapping.set(episodeKey, index);
		} else if (parsed.episode !== undefined) {
			// Episode only (assume default season or season 1)
			const season = defaultSeason ?? 1;
			const episodeKey = season * 100 + parsed.episode;
			mapping.set(episodeKey, index);
		} else {
			// Try regex patterns directly on filename
			const sxxexx = file.name.match(SXXEXX_PATTERN);
			if (sxxexx) {
				const season = Number.parseInt(sxxexx[1], 10);
				const episode = Number.parseInt(sxxexx[2], 10);
				const episodeKey = season * 100 + episode;
				mapping.set(episodeKey, index);
				continue;
			}

			const nxnn = file.name.match(NXNN_PATTERN);
			if (nxnn) {
				const season = Number.parseInt(nxnn[1], 10);
				const episode = Number.parseInt(nxnn[2], 10);
				const episodeKey = season * 100 + episode;
				mapping.set(episodeKey, index);
			}
		}
	}

	return mapping;
}

/**
 * Auto-number files sequentially when mapping fails
 */
function autoNumberFiles(files: TorrentFile[], defaultSeason?: number): Map<number, number> {
	const mapping = new Map<number, number>();

	// Sort files by name to maintain order
	const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

	const season = defaultSeason ?? 1;
	for (const [index, file] of sortedFiles.entries()) {
		// Assume default season, episode = index + 1
		const episodeKey = season * 100 + (index + 1);
		mapping.set(episodeKey, files.indexOf(file));
	}

	return mapping;
}

function groupEpisodesBySeason(
	mapping: Map<number, number>
): Map<number, Array<{ episodeNumber: number; fileIndex: number }>> {
	const seasonEpisodes = new Map<number, Array<{ episodeNumber: number; fileIndex: number }>>();

	for (const [episodeKey, fileIndex] of mapping.entries()) {
		const season = Math.floor(episodeKey / 100);
		const episode = episodeKey % 100;

		if (!seasonEpisodes.has(season)) {
			seasonEpisodes.set(season, []);
		}
		seasonEpisodes.get(season)?.push({ episodeNumber: episode, fileIndex });
	}

	return seasonEpisodes;
}

function getOrAddSeason(mediaId: string, seasonNum: number, episodeCount: number) {
	let season = seasonsDb.getByMediaAndNumber(mediaId, seasonNum);

	if (!season) {
		season = seasonsDb.create({
			mediaId,
			seasonNumber: seasonNum,
			name: `Season ${seasonNum}`,
			episodeCount,
		});
	}

	return season;
}

function updateExistingEpisode(existingEpisode: { id: string }, videoFiles: TorrentFile[], fileIndex: number): void {
	const videoFile = videoFiles[fileIndex];
	if (videoFile) {
		mediaDb.updateFileInfo(existingEpisode.id, {
			fileIndex,
			filePath: videoFile.path,
			fileSize: videoFile.length,
		});
	}
}

function createNewEpisode(
	showMedia: { id: string; userId: string; organizationId: string | null },
	seasonId: string,
	seasonNumber: number,
	episodeNumber: number,
	displayOrder: number,
	videoFiles: TorrentFile[],
	fileIndex: number
): void {
	const videoFile = videoFiles[fileIndex];
	mediaDb.create({
		userId: showMedia.userId,
		organizationId: showMedia.organizationId,
		type: 'episode',
		parentId: showMedia.id,
		seasonId,
		seasonNumber,
		episodeNumber,
		title: `Episode ${episodeNumber}`,
		fileIndex,
		filePath: videoFile?.path ?? null,
		fileSize: videoFile?.length ?? null,
		downloadedBytes: 0,
		displayOrder,
		status: 'pending',
	});
}

async function processEpisodesForSeason(
	showMedia: { id: string; userId: string; organizationId: string | null },
	seasonNum: number,
	episodes: Array<{ episodeNumber: number; fileIndex: number }>,
	videoFiles: TorrentFile[]
): Promise<void> {
	const season = getOrAddSeason(showMedia.id, seasonNum, episodes.length);

	for (const [displayOrder, ep] of episodes.entries()) {
		const existingEpisode = mediaDb.getEpisodeBySeasonAndNumber(season.id, ep.episodeNumber);

		if (existingEpisode) {
			updateExistingEpisode(existingEpisode, videoFiles, ep.fileIndex);
		} else {
			createNewEpisode(showMedia, season.id, seasonNum, ep.episodeNumber, displayOrder, videoFiles, ep.fileIndex);
		}
	}

	seasonsDb.updateEpisodeCount(season.id, episodes.length);
}

/**
 * Create episode records from file mapping
 */
async function createEpisodesFromMapping(
	mediaId: string,
	videoFiles: TorrentFile[],
	mapping: Map<number, number>
): Promise<void> {
	const mediaItem = mediaDb.getById(mediaId);
	if (!mediaItem || mediaItem.type !== 'show') {
		return;
	}

	const seasonEpisodes = groupEpisodesBySeason(mapping);

	for (const [seasonNum, episodes] of seasonEpisodes.entries()) {
		await processEpisodesForSeason(mediaItem, seasonNum, episodes, videoFiles);
	}
}

async function fetchAndUpdateMetadata(mediaId: string, fileName: string, mediaType: MediaType): Promise<void> {
	try {
		// Check if media already has TMDB data - skip entirely if so
		const existingMedia = mediaDb.getById(mediaId);
		if (existingMedia?.tmdbId) {
			// console.log(
			// 	`[${mediaId}] Media already has TMDB data (tmdbId: ${existingMedia.tmdbId}), skipping metadata fetch`
			// );
			return;
		}

		// Also skip if we already have a poster URL (means TMDB data was fetched successfully during creation)
		if (existingMedia?.posterUrl) {
			// console.log(`[${mediaId}] Media already has poster data, skipping metadata fetch`);
			return;
		}

		// Parse title and year from file name
		const parsed = ptt.parse(fileName);
		// console.log(`[${mediaId}] Parsed filename: title="${parsed.title}", year=${parsed.year}`);

		if (!parsed.title) {
			// console.log(`[${mediaId}] Could not parse title from filename`);
			return;
		}

		// Update title from filename (only if we don't have TMDB data)
		mediaDb.updateMetadata(mediaId, { title: parsed.title, year: parsed.year || null });

		// Search TMDB if API key is configured
		if (config.tmdb.apiKey) {
			// console.log(
			// 	`[${mediaId}] Searching TMDB for: "${parsed.title}" (${parsed.year || 'no year'})`
			// );

			const results =
				mediaType === 'show'
					? await searchTVShow(parsed.title, parsed.year)
					: await searchMovie(parsed.title, parsed.year);

			// console.log(`[${mediaId}] TMDB returned ${results.length} results`);

			if (results.length > 0) {
				const tmdbData = results[0];
				// console.log(
				// 	`[${mediaId}] Using TMDB result: "${tmdbData.title}" (${tmdbData.year}), poster: ${tmdbData.posterUrl}`
				// );
				mediaDb.updateMetadata(mediaId, {
					title: tmdbData.title,
					year: tmdbData.year,
					posterUrl: tmdbData.posterUrl,
					backdropUrl: tmdbData.backdropUrl,
					overview: tmdbData.overview,
					tmdbId: tmdbData.tmdbId,
					totalSeasons: tmdbData.totalSeasons,
				});
			}
		}
	} catch (e) {
		console.error(`[${mediaId}] Failed to fetch metadata:`, e);
	}
}

export async function startDownload(mediaId: string, magnetLink: string): Promise<void> {
	// Extract infohash from magnet link using our reliable regex-based parser
	const { infohash } = parseMagnet(magnetLink);

	if (!infohash) {
		console.error(`[${mediaId}] Could not extract infohash from magnet link`);
		throw new Error('Invalid magnet link - could not extract infohash');
	}

	// Check if this specific torrent is already active
	if (activeDownloads.has(infohash)) {
		// console.log(`[${mediaId}] Torrent ${infohash} already active`);
		return;
	}

	// Check if there's a pending download promise for this torrent
	const pending = pendingDownloads.get(infohash);
	if (pending) {
		// console.log(`[${mediaId}] Torrent ${infohash} pending, waiting...`);
		return pending;
	}

	// Create a promise for this download initialization
	const downloadPromise = initializeDownload(mediaId, magnetLink, infohash);
	pendingDownloads.set(infohash, downloadPromise);

	try {
		await downloadPromise;
	} finally {
		pendingDownloads.delete(infohash);
	}
}

async function handleDownloadComplete(infohash: string, download: ActiveDownload, torrent: Torrent): Promise<void> {
	// const logPrefix = `[${download.mediaId}:${infohash.slice(0, 8)}]`;

	// Prevent double-completion
	if (download.status === 'complete' || download.status === 'finalizing') {
		// console.log(`${logPrefix} Already marked complete, skipping`);
		return;
	}

	// console.log(`${logPrefix} Handling download completion...`);
	download.status = 'finalizing';
	download.progress = 1;

	// Stop seeding - deselect all files to prevent uploading
	for (const f of torrent.files) {
		f.deselect();
	}
	// console.log(`${logPrefix} Stopped seeding`);

	try {
		await moveToLibrary(download.mediaId, download);
	} catch (err) {
		console.error('[Finalizer] Post-download finalization failed:', err);
		download.status = 'error';
		download.error = err instanceof Error ? err.message : 'Failed to finalize download';
		const failedRecord = downloadsDb.getByInfohash(download.mediaId, infohash);
		if (failedRecord) {
			downloadsDb.updateProgress(failedRecord.id, download.progress, 'error');
		}
		updateMediaStatusFromDownloads(download.mediaId);
		return;
	}
	download.status = 'complete';

	// Update download record in database
	const downloadRecord = downloadsDb.getByInfohash(download.mediaId, infohash);
	if (downloadRecord) {
		downloadsDb.updateProgress(downloadRecord.id, 1, 'complete');
		// console.log(`${logPrefix} Updated download record ${downloadRecord.id} to complete`);
	}

	// Update media status if all downloads for this media are complete
	updateMediaStatusFromDownloads(download.mediaId);
	cleanupDownload(download.infohash, true);
}

/** Update media status based on all active downloads for that media */
function updateMediaStatusFromDownloads(mediaId: string): void {
	const downloads = getDownloadsForMedia(mediaId);
	const allComplete = downloads.length === 0 || downloads.every((d) => d.status === 'complete');
	const anyError = downloads.some((d) => d.status === 'error');

	if (allComplete) {
		mediaDb.updateProgress(mediaId, 1, 'complete');
	} else if (anyError) {
		// If any download has error but others are still going, keep downloading status
		const hasActiveDownloads = downloads.some(
			(d) => d.status === 'downloading' || d.status === 'initializing' || d.status === 'finalizing'
		);
		if (!hasActiveDownloads) {
			mediaDb.updateProgress(mediaId, 0, 'error');
		}
	}
}

// Periodically check if video file is complete (fallback for missed 'done' events)
function startCompletionChecker(infohash: string, download: ActiveDownload, torrent: Torrent): void {
	const _logPrefix = `[${download.mediaId}:${infohash.slice(0, 8)}]`;

	const checkInterval = setInterval(() => {
		// Stop checking if download is no longer active or already complete
		if (!activeDownloads.has(infohash) || download.status === 'complete' || download.status === 'finalizing') {
			clearInterval(checkInterval);
			return;
		}

		// For movies, check single file
		if (download.mediaType === 'movie' && download.videoFile?.progress === 1) {
			// console.log(`${logPrefix} Completion checker detected finished download`);
			clearInterval(checkInterval);
			handleDownloadComplete(infohash, download, torrent).catch((err) => {
				console.error(`${_logPrefix} Error in completion checker:`, err);
			});
			return;
		}

		// For TV shows, check if all selected files are complete
		if (download.mediaType === 'show') {
			const selectedComplete = download.videoFiles.every((f) => f.progress === 1);
			if (selectedComplete) {
				// console.log(`${logPrefix} Completion checker detected all files finished`);
				clearInterval(checkInterval);
				handleDownloadComplete(infohash, download, torrent).catch((err) => {
					console.error(`${_logPrefix} Error in completion checker:`, err);
				});
			}
		}
	}, 5000); // Check every 5 seconds
}

/** Get or add torrent to client */
function getOrAddTorrent(
	torrentClient: WebTorrentClient,
	magnetLink: string,
	downloadPath: string,
	mediaId: string
): Torrent | null {
	let infoHash: string | undefined;
	try {
		const parsed = parseTorrent(magnetLink);
		if (typeof parsed === 'string') {
			infoHash = parsed;
		} else if (parsed && typeof parsed === 'object' && 'infoHash' in parsed) {
			infoHash = parsed.infoHash;
		}
	} catch (e) {
		console.warn(`[${mediaId}] Failed to parse magnet link for infoHash check`, e);
	}

	const existing = infoHash ? torrentClient.get(infoHash) : null;
	if (existing) {
		// console.log(`[${mediaId}] Torrent already exists (cached), reusing: ${infoHash}`);
		return existing;
	}

	return torrentClient.add(magnetLink, {
		path: downloadPath,
		announce: TRACKERS,
	});
}

/** Handle TV show torrent ready */
async function handleTVShowReady(
	mediaId: string,
	download: ActiveDownload,
	torrent: Torrent,
	reject: (err: Error) => void
): Promise<boolean> {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;
	download.videoFiles = findVideoFiles(torrent.files);

	if (download.videoFiles.length === 0) {
		const allFiles = torrent.files.map((f) => f.name).join(', ');
		console.error(`${logPrefix} No supported video files found. Files: ${allFiles}`);
		download.status = 'error';
		download.error = `No supported video file found. Supported formats: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`;
		cleanupDownload(download.infohash, true);
		reject(new Error('No supported video file found in torrent'));
		return false;
	}

	// console.log(`${logPrefix} Found ${download.videoFiles.length} video files for TV show`);

	// Parse torrent name to see if we can detect a season number
	// Fallback to undefined if not found
	const parsedTorrent = ptt.parse(torrent.name);
	const defaultSeason = parsedTorrent.season;
	if (defaultSeason) {
		// console.log(`${logPrefix} Detected default season from torrent name: Season ${defaultSeason}`);
	}

	download.episodeMapping = mapFilesToEpisodes(download.videoFiles, defaultSeason);
	if (download.episodeMapping.size === 0) {
		// console.log(`${logPrefix} Episode mapping failed, using auto-number fallback`);
		download.episodeMapping = autoNumberFiles(download.videoFiles, defaultSeason);
	}

	try {
		await createEpisodesFromMapping(mediaId, download.videoFiles, download.episodeMapping);
	} catch (e) {
		console.error(`${logPrefix} Failed to create episodes:`, e);
		// Continue anyway - we'll retry in moveTVShowToLibrary if needed
	}

	download.totalSize = download.videoFiles.reduce((sum, f) => sum + f.length, 0);

	for (const f of torrent.files) {
		f.deselect();
	}
	for (const f of download.videoFiles) {
		f.select();
	}

	// Also select subtitle files for download
	download.subtitleFiles = findSubtitleFiles(torrent.files);
	for (const f of download.subtitleFiles) {
		f.select();
	}

	fetchAndUpdateMetadata(mediaId, download.videoFiles[0]?.name ?? torrent.name, 'show');
	return true;
}

/** Handle movie torrent ready */
function handleMovieReady(
	mediaId: string,
	actualMediaType: MediaType,
	download: ActiveDownload,
	torrent: Torrent,
	reject: (err: Error) => void
): boolean {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;
	const videoFile = findVideoFile(torrent.files);

	if (!videoFile) {
		const allFiles = torrent.files.map((f) => f.name).join(', ');
		console.error(`${logPrefix} No supported video file found. Files: ${allFiles}`);
		download.status = 'error';
		download.error = `No supported video file found. Supported formats: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`;
		cleanupDownload(download.infohash, true);
		reject(new Error('No supported video file found in torrent'));
		return false;
	}

	// console.log(
	// 	`${logPrefix} Selected video: ${videoFile.name} (${(videoFile.length / 1024 / 1024).toFixed(2)} MB)`
	// );

	if (actualMediaType === 'movie') {
		fetchAndUpdateMetadata(mediaId, videoFile.name, 'movie');
	}

	for (const f of torrent.files) {
		f.deselect();
	}
	videoFile.select();

	// Also select subtitle files for download
	download.subtitleFiles = findSubtitleFiles(torrent.files);
	for (const f of download.subtitleFiles) {
		f.select();
	}

	download.videoFile = videoFile;
	download.totalSize = videoFile.length;
	return true;
}

/** Check if download is already complete */
function checkAlreadyComplete(infohash: string, download: ActiveDownload, torrent: Torrent): void {
	const logPrefix = `[${download.mediaId}:${infohash.slice(0, 8)}]`;

	if (download.mediaType === 'movie' && (download.videoFile?.progress === 1 || torrent.done)) {
		// console.log(`${logPrefix} Video file already complete, triggering done handler`);
		setImmediate(() => {
			handleDownloadComplete(infohash, download, torrent).catch((err) => {
				console.error(`${logPrefix} Error handling already-complete download:`, err);
			});
		});
	} else if (download.mediaType === 'show') {
		const allComplete = download.videoFiles.every((f) => f.progress === 1);
		if (allComplete || torrent.done) {
			// console.log(`${logPrefix} All TV files already complete, triggering done handler`);
			setImmediate(() => {
				handleDownloadComplete(infohash, download, torrent).catch((err) => {
					console.error(`${logPrefix} Error handling already-complete download:`, err);
				});
			});
		}
	}
}

async function initializeDownload(mediaId: string, magnetLink: string, infohash: string): Promise<void> {
	await ensureDirectories();

	// Use infohash in path to allow multiple torrents for same media
	const downloadPath = path.join(config.paths.temp, mediaId, infohash);
	await fs.mkdir(downloadPath, { recursive: true });

	const mediaItem = mediaDb.getById(mediaId);
	const mediaType: MediaType = mediaItem?.type === 'show' ? 'show' : 'movie';
	const actualMediaType = mediaItem?.type ?? 'movie';

	// console.log(`[${mediaId}:${infohash.slice(0, 8)}] Starting download (type: ${mediaType})...`);
	// console.log(`[${mediaId}:${infohash.slice(0, 8)}] Magnet: ${magnetLink.substring(0, 80)}...`);
	mediaDb.updateProgress(mediaId, 0, 'downloading');

	const torrentClient = await getClient();

	return new Promise((resolve, reject) => {
		let torrent: Torrent | null;

		try {
			torrent = getOrAddTorrent(torrentClient, magnetLink, downloadPath, mediaId);
			if (!torrent) {
				reject(new Error('Failed to add torrent'));
				return;
			}
		} catch (e) {
			console.error(`[${mediaId}:${infohash.slice(0, 8)}] Failed to add torrent:`, e);
			reject(e);
			return;
		}

		const download: ActiveDownload = {
			mediaId,
			infohash,
			mediaType,
			torrent,
			videoFile: null,
			videoFiles: [],
			subtitleFiles: [],
			selectedFileIndex: null,
			episodeMapping: new Map(),
			progress: 0,
			status: 'initializing',
			activeStreams: 0,
			totalSize: 0,
		};

		activeDownloads.set(infohash, download);

		const logPrefix = `[${mediaId}:${infohash.slice(0, 8)}]`;

		// torrent.on('wire', () => {
		// 	console.log(`${logPrefix} Connected to peer, total: ${torrent?.numPeers}`);
		// });

		// torrent.on('noPeers', (announceType: string) => {
		// 	console.log(`${logPrefix} No peers from ${announceType}`);
		// });

		// torrent.on('warning', (err: Error) => {
		// 	console.warn(`${logPrefix} Warning:`, err.message);
		// });

		torrent.on('ready', async () => {
			if (!torrent) {
				return;
			}
			// console.log(`${logPrefix} Torrent ready: ${torrent.infoHash}`);

			const success =
				mediaType === 'show'
					? await handleTVShowReady(mediaId, download, torrent, reject)
					: handleMovieReady(mediaId, actualMediaType, download, torrent, reject);

			if (!success) {
				return;
			}

			download.status = 'downloading';
			startCompletionChecker(infohash, download, torrent);
			checkAlreadyComplete(infohash, download, torrent);
			resolve();
		});

		torrent.on('download', () => {
			if (download.mediaType === 'movie' && download.videoFile) {
				download.progress = download.videoFile.progress;
			} else if (download.mediaType === 'show' && download.videoFiles.length > 0) {
				const totalDownloaded = download.videoFiles.reduce((sum, f) => sum + f.downloaded, 0);
				download.progress = totalDownloaded / download.totalSize;
			}

			// Don't update media progress here - it will be aggregated in getDownloadStatus
		});

		torrent.on('done', () => {
			if (!torrent) {
				return;
			}
			// console.log(`${logPrefix} Torrent 'done' event fired!`);
			handleDownloadComplete(infohash, download, torrent).catch((err) => {
				console.error(`${logPrefix} Error in done handler:`, err);
			});
		});

		torrent.on('error', (err: Error) => {
			console.error(`${logPrefix} Torrent error:`, err);
			download.status = 'error';
			download.error = err.message;
			reject(err);
		});

		setTimeout(() => {
			if (download.status === 'initializing') {
				const timeoutError = 'No seeders found - the torrent may be dead or unavailable';
				download.status = 'error';
				download.error = timeoutError;
				const downloadRecord = downloadsDb.getByInfohash(mediaId, infohash);
				if (downloadRecord) {
					downloadsDb.updateProgress(downloadRecord.id, 0, 'error');
				}
				mediaDb.updateProgress(mediaId, 0, 'error');
				cleanupDownload(infohash, true);
				reject(new Error(timeoutError));
			}
		}, 120_000);

		if (torrent.ready) {
			setImmediate(() => {
				torrent?.emit('ready');
			});
		}
	});
}

/** Move movie file to library */
async function moveMovieToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;

	if (!download.videoFile) {
		return;
	}

	const sourcePath = path.join(download.torrent.path, download.videoFile.path);
	const mediaItem = mediaDb.getById(mediaId);
	const destDir = mediaItem ? getMovieLibraryRoot(mediaItem) : path.join(config.paths.library, mediaId);
	const fileName = mediaItem ? buildMovieFileName(mediaItem, download.videoFile.name) : download.videoFile.name;
	const destPath = path.join(destDir, fileName);

	await fs.mkdir(destDir, { recursive: true });
	const finalized = await finalizeMediaToLibrary(sourcePath, destPath);

	// Copy subtitle files alongside the video
	for (const subFile of download.subtitleFiles) {
		try {
			const subSource = path.join(download.torrent.path, subFile.path);
			const subDest = path.join(destDir, subFile.name);
			await fs.copyFile(subSource, subDest);
		} catch (subErr) {
			console.error(`${logPrefix} Failed to copy subtitle ${subFile.name}:`, subErr);
		}
	}

	mediaDb.updateFilePath(mediaId, finalized.filePath, finalized.fileSize);

	// Trigger subtitle discovery (sidecar + embedded) in background
	discoverSubtitles(mediaId, finalized.filePath, destDir).catch((err) => {
		console.error(`${logPrefix} Subtitle discovery failed:`, err);
	});
}

/** Get season number for a video file based on episode mapping */
function getSeasonForFile(download: ActiveDownload, fileIndex: number): number {
	for (const [episodeKey, mappedIndex] of download.episodeMapping.entries()) {
		if (mappedIndex === fileIndex) {
			return Math.floor(episodeKey / 100);
		}
	}
	// Default to season 1 if not found in mapping
	return 1;
}

/** Update episode file info after copy */
async function updateEpisodeFileInfo(
	mediaId: string,
	download: ActiveDownload,
	videoFile: TorrentFile,
	filePath: string,
	fileSize: number
): Promise<void> {
	const fileIndex = download.videoFiles.indexOf(videoFile);

	for (const [episodeKey, mappedIndex] of download.episodeMapping.entries()) {
		if (mappedIndex !== fileIndex) {
			continue;
		}

		const seasonNum = Math.floor(episodeKey / 100);
		const episodeNum = episodeKey % 100;
		const season = seasonsDb.getByMediaAndNumber(mediaId, seasonNum);

		if (!season) {
			console.warn(`[${mediaId}] Season ${seasonNum} not found in DB for episode S${seasonNum}E${episodeNum}`);
			continue;
		}

		const episode = mediaDb.getEpisodeBySeasonAndNumber(season.id, episodeNum);
		if (episode) {
			mediaDb.updateFileInfo(episode.id, {
				fileIndex,
				filePath,
				fileSize,
			});
			mediaDb.updateEpisodeProgress(episode.id, fileSize, 'complete');
			discoverSubtitles(episode.id, filePath, path.dirname(filePath)).catch((error) => {
				console.error(`[${mediaId}] Subtitle discovery failed for ${videoFile.name}:`, error);
			});
		} else {
			console.warn(`[${mediaId}] Episode S${seasonNum}E${episodeNum} not found in DB`);
		}
	}
}

function getEpisodeForFileIndex(mediaId: string, download: ActiveDownload, fileIndex: number) {
	for (const [episodeKey, mappedIndex] of download.episodeMapping.entries()) {
		if (mappedIndex !== fileIndex) {
			continue;
		}
		const seasonNumber = Math.floor(episodeKey / 100);
		const episodeNumber = episodeKey % 100;
		return mediaDb.getEpisodeByParentAndNumber(mediaId, seasonNumber, episodeNumber);
	}
	return undefined;
}

async function moveEpisodeToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;
	const episode = mediaDb.getById(mediaId);
	if (!(episode && episode.type === 'episode' && download.videoFile)) {
		return;
	}
	const sourcePath = path.join(download.torrent.path, download.videoFile.path);
	const show = episode.parentId ? mediaDb.getById(episode.parentId) : null;
	if (!(show && show.type === 'show')) {
		return;
	}
	const seasonDir = getSeasonLibraryDirectory(show, episode.seasonNumber);
	const destPath = getEpisodeLibraryPath(show, episode, download.videoFile.name);

	await fs.mkdir(seasonDir, { recursive: true });
	const finalized = await finalizeMediaToLibrary(sourcePath, destPath);
	for (const subFile of download.subtitleFiles) {
		try {
			const subSource = path.join(download.torrent.path, subFile.path);
			const subDest = path.join(seasonDir, subFile.name);
			await fs.copyFile(subSource, subDest);
		} catch (subErr) {
			console.error(`${logPrefix} Failed to copy subtitle ${subFile.name}:`, subErr);
		}
	}
	mediaDb.updateFileInfo(mediaId, {
		fileIndex: episode.fileIndex,
		filePath: finalized.filePath,
		fileSize: finalized.fileSize,
	});
	mediaDb.updateEpisodeProgress(mediaId, finalized.fileSize, 'complete');
	discoverSubtitles(mediaId, finalized.filePath, seasonDir).catch((errorValue) => {
		console.error(`${logPrefix} Subtitle discovery failed:`, errorValue);
	});
}

/** Move TV show files to library organized by season */
async function moveTVShowToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const logPrefix = `[${mediaId}:${download.infohash.slice(0, 8)}]`;
	const show = mediaDb.getById(mediaId);
	if (!(show && show.type === 'show')) {
		return;
	}
	const baseDir = getShowLibraryRoot(show);
	await fs.mkdir(baseDir, { recursive: true });

	// Ensure episodes exist in database (fallback if initial creation failed)
	const existingSeasons = seasonsDb.getByMediaId(mediaId);
	if (existingSeasons.length === 0 && download.episodeMapping) {
		// console.log(`${logPrefix} No seasons found in DB, creating episodes before library move`);
		try {
			await createEpisodesFromMapping(mediaId, download.videoFiles, download.episodeMapping);
		} catch (e) {
			console.error(`${logPrefix} Failed to create episodes during library move:`, e);
		}
	}

	// Group files by season
	const filesBySeason = new Map<number, TorrentFile[]>();
	for (const [index, videoFile] of download.videoFiles.entries()) {
		const seasonNum = getSeasonForFile(download, index);
		const files = filesBySeason.get(seasonNum) || [];
		files.push(videoFile);
		filesBySeason.set(seasonNum, files);
	}

	// Copy subtitle files to the base library directory
	for (const subFile of download.subtitleFiles) {
		try {
			const subSource = path.join(download.torrent.path, subFile.path);
			const subDest = path.join(baseDir, subFile.name);
			await fs.copyFile(subSource, subDest);
		} catch (subErr) {
			console.error(`${logPrefix} Failed to copy subtitle ${subFile.name}:`, subErr);
		}
	}

	// Copy video files organized by season and trigger per-episode subtitle discovery
	for (const [seasonNum, files] of filesBySeason.entries()) {
		const seasonDir = path.join(baseDir, `Season ${seasonNum.toString().padStart(2, '0')}`);
		await fs.mkdir(seasonDir, { recursive: true });

		for (const videoFile of files) {
			const fileIndex = download.videoFiles.indexOf(videoFile);
			const episode = getEpisodeForFileIndex(mediaId, download, fileIndex);
			const sourcePath = path.join(download.torrent.path, videoFile.path);
			const destPath = episode
				? getEpisodeLibraryPath(show, episode, videoFile.name)
				: path.join(seasonDir, videoFile.name);

			const finalized = await finalizeMediaToLibrary(sourcePath, destPath);
			await updateEpisodeFileInfo(mediaId, download, videoFile, finalized.filePath, finalized.fileSize);
		}
	}
}

async function moveToLibrary(mediaId: string, download: ActiveDownload): Promise<void> {
	const mediaItem = mediaDb.getById(mediaId);
	if (mediaItem?.type === 'episode') {
		await moveEpisodeToLibrary(mediaId, download);
		return;
	}
	if (download.mediaType === 'movie') {
		await moveMovieToLibrary(mediaId, download);
	} else {
		await moveTVShowToLibrary(mediaId, download);
	}
}

function cleanupDownload(infohash: string, removeFiles: boolean): void {
	const download = activeDownloads.get(infohash);
	if (!download) {
		return;
	}

	download.torrent.destroy({ destroyStore: removeFiles }, () => {
		// console.log(`[${download.mediaId}:${infohash.slice(0, 8)}] Torrent destroyed`);
	});

	activeDownloads.delete(infohash);
}

export interface StreamInfo {
	stream: Readable;
	fileSize: number;
	fileName: string;
	mimeType: string;
	isComplete: boolean;
}

/** Create stream from library file */
function createLibraryStream(filePath: string, start?: number, end?: number): StreamInfo | null {
	try {
		const stats = statSync(filePath);
		const fileName = path.basename(filePath);

		const streamOptions: { start?: number; end?: number } = {};
		if (start !== undefined) {
			streamOptions.start = start;
		}
		if (end !== undefined) {
			streamOptions.end = end;
		}

		return {
			stream: createReadStream(filePath, streamOptions),
			fileSize: stats.size,
			fileName,
			mimeType: getMimeType(fileName),
			isComplete: true,
		};
	} catch (e) {
		console.error(`Error reading file from library: ${e}`);
		return null;
	}
}

function getLibraryVideoStream(
	mediaItem: { filePath: string | null },
	start?: number,
	end?: number
): StreamInfo | null {
	if (!(mediaItem.filePath && existsSync(mediaItem.filePath))) {
		return null;
	}
	return createLibraryStream(mediaItem.filePath, start, end);
}

/** Get stream from active torrent download */
function getTorrentStream(
	download: ActiveDownload,
	fileIndex: number | undefined,
	start?: number,
	end?: number
): StreamInfo | null {
	if (download.mediaType === 'show' && fileIndex !== undefined) {
		const videoFile = download.videoFiles[fileIndex];
		if (!videoFile) {
			return null;
		}

		for (const [i, f] of download.videoFiles.entries()) {
			if (i === fileIndex) {
				f.select();
			} else {
				f.deselect();
			}
		}

		download.selectedFileIndex = fileIndex;
		return createTorrentStream(download, videoFile, start, end);
	}

	if (download.videoFile) {
		return createTorrentStream(download, download.videoFile, start, end);
	}

	return null;
}

export async function getVideoStream(mediaId: string, start?: number, end?: number): Promise<StreamInfo | null> {
	const mediaItem = mediaDb.getById(mediaId);
	if (!mediaItem || mediaItem.type === 'show') {
		return null;
	}
	const libraryStream = getLibraryVideoStream(mediaItem, start, end);
	if (libraryStream) {
		return libraryStream;
	}
	const downloadOwnerId = getDownloadOwnerMediaId(mediaItem);
	const downloads = getDownloadsForMedia(downloadOwnerId);
	const fileIndex = resolveEpisodeFileIndex(mediaItem, downloads);

	const suitableDownload = downloads.find((d) => {
		if (d.status === 'error') {
			return false;
		}
		if (d.mediaType === 'movie' && d.videoFile) {
			return true;
		}
		if (d.mediaType === 'show' && fileIndex !== undefined) {
			return d.videoFiles[fileIndex] !== undefined;
		}
		return false;
	});

	if (!suitableDownload) {
		return null;
	}
	return getTorrentStream(suitableDownload, fileIndex, start, end);
}

function createTorrentStream(
	download: ActiveDownload,
	videoFile: TorrentFile,
	start?: number,
	end?: number
): StreamInfo {
	const fileSize = videoFile.length;
	const fileName = videoFile.name;

	// Track active stream
	download.activeStreams++;

	const streamOptions: { start?: number; end?: number } = {};
	if (start !== undefined) {
		streamOptions.start = start;
	}
	if (end !== undefined) {
		streamOptions.end = end;
	}

	const torrentStream = videoFile.createReadStream(streamOptions);

	// Decrement active streams when stream ends
	const decrementStreams = () => {
		download.activeStreams = Math.max(0, download.activeStreams - 1);
	};

	torrentStream.once('end', decrementStreams);
	torrentStream.once('error', decrementStreams);
	torrentStream.once('close', decrementStreams);

	return {
		stream: torrentStream,
		fileSize,
		fileName,
		mimeType: getMimeType(fileName),
		isComplete: download.status === 'complete',
	};
}

interface DownloadStatusResult {
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	peers: number;
	status: 'idle' | 'initializing' | 'downloading' | 'complete' | 'error';
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

/** Collect episode progress from a TV show download */
function collectEpisodeProgress(download: ActiveDownload, episodeProgress: Map<number, number>): void {
	if (download.mediaType !== 'show') {
		return;
	}
	for (const [episodeKey, fileIndex] of download.episodeMapping.entries()) {
		const file = download.videoFiles[fileIndex];
		if (file) {
			episodeProgress.set(episodeKey, file.progress);
		}
	}
}

/** Aggregate download statistics */
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

		result.hasInitializing = result.hasInitializing || download.status === 'initializing';
		result.hasDownloading =
			result.hasDownloading || download.status === 'downloading' || download.status === 'finalizing';
		result.hasError = result.hasError || download.status === 'error';
		result.allComplete = result.allComplete && download.status === 'complete';

		if (download.status === 'error' && download.error) {
			result.errors.push(download.error);
		}

		collectEpisodeProgress(download, result.episodeProgress);
	}

	return result;
}

/** Determine overall status from aggregated stats */
function determineOverallStatus(stats: AggregatedStats): DownloadStatusResult['status'] {
	if (stats.allComplete) {
		return 'complete';
	}
	if (stats.hasError && !stats.hasDownloading && !stats.hasInitializing) {
		return 'error';
	}
	if (stats.hasInitializing) {
		return 'initializing';
	}
	return 'downloading';
}

export function getDownloadStatus(mediaId: string): DownloadStatusResult | null {
	const mediaItem = mediaDb.getById(mediaId);
	const downloadOwnerId = mediaItem ? getDownloadOwnerMediaId(mediaItem) : mediaId;
	const downloads = getDownloadsForMedia(downloadOwnerId);

	if (downloads.length === 0) {
		if (mediaItem?.status === 'complete') {
			return { progress: 1, downloadSpeed: 0, uploadSpeed: 0, peers: 0, status: 'complete' };
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
		error: stats.errors.length > 0 ? stats.errors.join('; ') : undefined,
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

/** Check if download is ready for streaming */
function isDownloadReadyForStreaming(download: ActiveDownload | undefined, fileIndex?: number): boolean {
	if (!download) {
		return false;
	}

	// For TV shows with specific file index
	if (download.mediaType === 'show' && fileIndex !== undefined) {
		const videoFile = download.videoFiles[fileIndex];
		return Boolean(
			videoFile &&
				download.status !== 'initializing' &&
				(videoFile.progress >= 0.02 || download.status === 'complete')
		);
	}

	// For movies
	if (download.videoFile) {
		return download.status !== 'initializing' && (download.progress >= 0.02 || download.status === 'complete');
	}

	return false;
}

/** Check if library file is ready */
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

// Cancel all active downloads for a media item
export async function cancelDownload(mediaId: string): Promise<void> {
	// console.log(`[${mediaId}] Cancelling all downloads...`);
	const mediaItem = mediaDb.getById(mediaId);
	const targetMediaIds =
		mediaItem?.type === 'show'
			? [mediaId, ...mediaDb.getEpisodesByParentId(mediaId).map((episode) => episode.id)]
			: [mediaId];
	const downloads = targetMediaIds.flatMap((targetMediaId) => getDownloadsForMedia(targetMediaId));

	// Also remove any pending downloads for this media
	for (const [infohash, download] of activeDownloads.entries()) {
		if (targetMediaIds.includes(download.mediaId)) {
			pendingDownloads.delete(infohash);
		}
	}

	// Destroy all torrents for this media
	const destroyPromises = downloads.map(
		(download) =>
			new Promise<void>((resolve) => {
				download.torrent.destroy({ destroyStore: true }, () => {
					// console.log(`[${mediaId}:${download.infohash.slice(0, 8)}] Download cancelled`);
					activeDownloads.delete(download.infohash);
					resolve();
				});
			})
	);

	await Promise.all(destroyPromises);
}

// Delete all files associated with a media item from the file system
export async function deleteMediaFiles(mediaId: string): Promise<void> {
	// console.log(`[${mediaId}] Deleting media files...`);
	const mediaItem = mediaDb.getById(mediaId);
	if (mediaItem?.type === 'episode') {
		if (mediaItem.filePath) {
			await fs.rm(mediaItem.filePath, { force: true }).catch(() => undefined);
		}
		await fs.rm(path.join(config.paths.temp, mediaId), { recursive: true, force: true }).catch(() => undefined);
		return;
	}
	let libraryPaths = [path.join(config.paths.library, mediaId)];
	if (mediaItem?.type === 'show') {
		libraryPaths = Array.from(new Set([getShowLibraryRoot(mediaItem), path.join(config.paths.library, mediaId)]));
	} else if (mediaItem?.type === 'movie') {
		libraryPaths = [getMovieLibraryRoot(mediaItem)];
	}
	const tempPaths =
		mediaItem?.type === 'show'
			? [
					path.join(config.paths.temp, mediaId),
					...mediaDb
						.getEpisodesByParentId(mediaId)
						.map((episode) => path.join(config.paths.temp, episode.id)),
				]
			: [path.join(config.paths.temp, mediaId)];

	for (const libraryPath of libraryPaths) {
		try {
			await fs.rm(libraryPath, { recursive: true, force: true });
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
				console.error(`[${mediaId}] Error deleting library directory:`, e);
			}
		}
	}

	for (const tempPath of tempPaths) {
		try {
			await fs.rm(tempPath, { recursive: true, force: true });
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
				console.error(`[${mediaId}] Error deleting temp directory:`, e);
			}
		}
	}
}

/**
 * Finalize a download from the temp directory.
 * Called during recovery when a video file already exists in temp but wasn't moved to library.
 */
async function finalizeFromTemp(mediaId: string, videoPath: string, fileName: string): Promise<boolean> {
	const mediaItem = mediaDb.getById(mediaId);
	if (!mediaItem) {
		return false;
	}
	let destDir = path.join(config.paths.library, mediaId);
	let destPath = path.join(destDir, fileName);
	if (mediaItem.type === 'movie') {
		destDir = getMovieLibraryRoot(mediaItem);
		destPath = path.join(destDir, buildMovieFileName(mediaItem, fileName));
	} else if (mediaItem.type === 'episode') {
		const show = mediaItem.parentId ? mediaDb.getById(mediaItem.parentId) : null;
		if (!(show && show.type === 'show')) {
			return false;
		}
		destDir = getSeasonLibraryDirectory(show, mediaItem.seasonNumber);
		destPath = getEpisodeLibraryPath(show, mediaItem, fileName);
	}

	try {
		const finalized = await finalizeMediaToLibrary(videoPath, destPath);

		if (mediaItem.type === 'episode') {
			mediaDb.updateFileInfo(mediaId, {
				fileIndex: mediaItem.fileIndex,
				filePath: finalized.filePath,
				fileSize: finalized.fileSize,
			});
		} else {
			mediaDb.updateFilePath(mediaId, finalized.filePath, finalized.fileSize);
		}

		mediaDb.updateProgress(mediaId, 1, 'complete');

		// Clean up temp directory
		const tempDir = path.join(config.paths.temp, mediaId);
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
			// console.log(`[Recovery] [${mediaId}] Cleaned up temp directory`);
		} catch {
			// Ignore cleanup errors
		}

		return true;
	} catch (e) {
		console.error(`[Recovery] [${mediaId}] Failed to finalize from temp:`, e);
		return false;
	}
}

/**
 * Find the largest video file in a directory (recursively).
 */
async function findVideoInDirectory(dirPath: string): Promise<{ path: string; name: string; size: number } | null> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		let bestVideo: { path: string; name: string; size: number } | null = null;

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);

			if (entry.isDirectory()) {
				const nested = await findVideoInDirectory(fullPath);
				if (nested && (!bestVideo || nested.size > bestVideo.size)) {
					bestVideo = nested;
				}
			} else if (entry.isFile() && isSupportedFormat(entry.name)) {
				const stats = await fs.stat(fullPath);
				if (!bestVideo || stats.size > bestVideo.size) {
					bestVideo = { path: fullPath, name: entry.name, size: stats.size };
				}
			}
		}

		return bestVideo;
	} catch {
		return null;
	}
}

/** Process a single incomplete media item during recovery */
async function recoverSingleMedia(mediaItem: {
	id: string;
	filePath: string | null;
	magnetLink: string | null;
	imdbId?: string | null;
}): Promise<void> {
	const mediaId = mediaItem.id;
	const tempDir = path.join(config.paths.temp, mediaId);

	// Skip if already being processed
	if (isDownloadActive(mediaId)) {
		// console.log(`[Recovery] [${mediaId}] Already active, skipping`);
		return;
	}

	// Check if file exists in library
	if (mediaItem.filePath && existsSync(mediaItem.filePath)) {
		// console.log(`[Recovery] [${mediaId}] File already in library, marking complete`);
		mediaDb.updateProgress(mediaId, 1, 'complete');
		return;
	}

	// Check if temp directory exists with video file
	if (existsSync(tempDir)) {
		const videoInfo = await findVideoInDirectory(tempDir);
		if (videoInfo && videoInfo.size >= MIN_VIDEO_SIZE) {
			// console.log(
			// 	`[Recovery] [${mediaId}] Found video in temp: ${videoInfo.name} (${(videoInfo.size / 1024 / 1024).toFixed(2)} MB)`
			// );
			const success = await finalizeFromTemp(mediaId, videoInfo.path, videoInfo.name);
			if (success) {
				return;
			}
		}
	}

	// No file found - restart download if magnet link is available
	if (mediaItem.magnetLink) {
		// console.log(`[Recovery] [${mediaId}] No file found, restarting download`);
		startDownload(mediaId, mediaItem.magnetLink).catch((e) => {
			console.error(`[Recovery] [${mediaId}] Failed to restart download:`, e);
			mediaDb.updateProgress(mediaId, 0, 'error');
		});
	} else if (mediaItem.imdbId) {
		const { acquireMediaByImdb } = await import('./media-acquisition');
		const result = await acquireMediaByImdb(mediaId);
		if (result.status === 'error') {
			mediaDb.updateProgress(mediaId, 0, 'error');
		}
	} else {
		mediaDb.updateProgress(mediaId, 0, 'not_found');
	}
}

/**
 * Recover incomplete downloads on server startup.
 * Checks for media stuck in 'downloading' or 'added' status and either:
 * - Finalizes them if the video file exists in temp
 * - Restarts the download if no file is found
 */
export async function recoverDownloads(): Promise<void> {
	// console.log('[Recovery] Checking for incomplete downloads...');

	const incompleteMedia = mediaDb.getIncompleteDownloads();

	if (incompleteMedia.length === 0) {
		// console.log('[Recovery] No incomplete downloads found');
		return;
	}

	// console.log(`[Recovery] Found ${incompleteMedia.length} incomplete download(s)`);

	for (const mediaItem of incompleteMedia) {
		await recoverSingleMedia(mediaItem);
	}
}
