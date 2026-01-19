import parseTorrent from 'parse-torrent';
import { config } from '$lib/config';
import { movies } from './db';
import { searchMovie } from './tmdb';
import { SUPPORTED_VIDEO_FORMATS, isSupportedFormat } from './transcoder';
import ptt from 'parse-torrent-title';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, existsSync, statSync } from 'fs';
import type { Readable } from 'stream';

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
  on(event: 'ready', callback: () => void): void;
  on(event: 'metadata', callback: () => void): void;
  on(event: 'done', callback: () => void): void;
  on(event: 'download', callback: (bytes: number) => void): void;
  on(event: 'upload', callback: (bytes: number) => void): void;
  on(event: 'wire', callback: (wire: unknown) => void): void;
  on(event: 'noPeers', callback: (announceType: string) => void): void;
  on(event: 'error', callback: (err: Error) => void): void;
  on(event: 'warning', callback: (err: Error) => void): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
}

interface WebTorrentClient {
  add(torrentId: string, opts?: { path?: string; announce?: string[] }, callback?: (torrent: Torrent) => void): Torrent;
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
  movieId: string;
  torrent: Torrent;
  videoFile: TorrentFile | null;
  progress: number;
  status: 'initializing' | 'downloading' | 'complete' | 'error';
  activeStreams: number;
  totalSize: number;
  error?: string;
}

// Store active downloads
const activeDownloads = new Map<string, ActiveDownload>();

// Pending download promises to prevent duplicate starts
const pendingDownloads = new Map<string, Promise<void>>();

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

async function getClient(): Promise<WebTorrentClient> {
  if (!client) {
    console.log('[WebTorrent] Initializing client...');
    const WebTorrent = await import('webtorrent');
    client = new WebTorrent.default({
      maxConns: 100,
      downloadLimit: -1,
      uploadLimit: -1,
    }) as unknown as WebTorrentClient;

    // Add global error handler
    (client as any).on('error', (err: Error) => {
      console.error('[WebTorrent] Global client error:', err);
    });

    console.log('[WebTorrent] Client initialized successfully');
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
    .filter(f => isSupportedFormat(f.name) && f.length >= MIN_VIDEO_SIZE)
    .sort((a, b) => b.length - a.length);

  if (videoFiles.length > 0) {
    return videoFiles[0];
  }

  // Fallback: get any supported video file regardless of size
  const anyVideo = files
    .filter(f => isSupportedFormat(f.name))
    .sort((a, b) => b.length - a.length)[0];

  return anyVideo || null;
}

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(config.paths.temp, { recursive: true });
  await fs.mkdir(config.paths.library, { recursive: true });
}

async function fetchAndUpdateMetadata(movieId: string, fileName: string): Promise<void> {
  try {
    // Check if movie already has TMDB data - skip entirely if so
    const existingMovie = movies.getById(movieId);
    if (existingMovie?.tmdbId) {
      console.log(`[${movieId}] Movie already has TMDB data (tmdbId: ${existingMovie.tmdbId}), skipping metadata fetch`);
      return;
    }

    // Also skip if we already have a poster URL (means TMDB data was fetched successfully during creation)
    if (existingMovie?.posterUrl) {
      console.log(`[${movieId}] Movie already has poster data, skipping metadata fetch`);
      return;
    }

    // Parse title and year from file name
    const parsed = ptt.parse(fileName);
    console.log(`[${movieId}] Parsed filename: title="${parsed.title}", year=${parsed.year}`);

    if (!parsed.title) {
      console.log(`[${movieId}] Could not parse title from filename`);
      return;
    }

    // Update title from filename (only if we don't have TMDB data)
    movies.updateMetadata(movieId, { title: parsed.title, year: parsed.year || null });

    // Search TMDB if API key is configured
    if (config.tmdb.apiKey) {
      console.log(`[${movieId}] Searching TMDB for: "${parsed.title}" (${parsed.year || 'no year'})`);
      const results = await searchMovie(parsed.title, parsed.year);
      console.log(`[${movieId}] TMDB returned ${results.length} results`);

      if (results.length > 0) {
        const tmdbData = results[0];
        console.log(`[${movieId}] Using TMDB result: "${tmdbData.title}" (${tmdbData.year}), poster: ${tmdbData.posterUrl}`);
        movies.updateMetadata(movieId, {
          title: tmdbData.title,
          year: tmdbData.year,
          posterUrl: tmdbData.posterUrl,
          backdropUrl: tmdbData.backdropUrl,
          overview: tmdbData.overview,
          tmdbId: tmdbData.tmdbId,
        });
      }
    }
  } catch (e) {
    console.error(`[${movieId}] Failed to fetch metadata:`, e);
  }
}

export async function startDownload(movieId: string, magnetLink: string): Promise<void> {
  // Check if already active
  if (activeDownloads.has(movieId)) {
    console.log(`Download already active for movie ${movieId}`);
    return;
  }

  // Check if there's a pending download promise (prevents race conditions)
  const pending = pendingDownloads.get(movieId);
  if (pending) {
    console.log(`Download pending for movie ${movieId}, waiting...`);
    return pending;
  }

  // Create a promise for this download initialization
  const downloadPromise = initializeDownload(movieId, magnetLink);
  pendingDownloads.set(movieId, downloadPromise);

  try {
    await downloadPromise;
  } finally {
    pendingDownloads.delete(movieId);
  }
}

async function initializeDownload(movieId: string, magnetLink: string): Promise<void> {
  await ensureDirectories();

  const downloadPath = path.join(config.paths.temp, movieId);
  await fs.mkdir(downloadPath, { recursive: true });

  console.log(`[${movieId}] Starting download...`);
  console.log(`[${movieId}] Magnet: ${magnetLink.substring(0, 80)}...`);
  console.log(`[${movieId}] Using ${TRACKERS.length} trackers`);
  movies.updateProgress(movieId, 0, 'downloading');

  const torrentClient = await getClient();
  console.log(`[${movieId}] Got WebTorrent client, adding torrent...`);

  return new Promise(async (resolve, reject) => {
    let torrent: Torrent;
    
    try {
      // Check for existing torrent with same infoHash
      // This prevents "Cannot add duplicate torrent" crash
      let infoHash: string | undefined;
      try {
        const parsed = parseTorrent(magnetLink);
        // parseTorrent can return an object with infoHash or just the infoHash string if it's a simple magnet
        // Types might be tricky but at runtime it has infoHash property if it's an object
        if (typeof parsed === 'string') {
            infoHash = parsed;
        } else if (parsed && typeof parsed === 'object' && 'infoHash' in parsed) {
            infoHash = parsed.infoHash;
        }
      } catch (e) {
        console.warn(`[${movieId}] Failed to parse magnet link for infoHash check`, e);
      }

      const existing = infoHash ? torrentClient.get(infoHash) : null;
      
      if (existing) {
        console.log(`[${movieId}] Torrent already exists (cached), reusing: ${infoHash}`);
        torrent = existing;
      } else {
         torrent = torrentClient.add(magnetLink, {
          path: downloadPath,
          announce: TRACKERS,
        });
      }
    } catch (e) {
      console.error(`[${movieId}] Failed to add torrent:`, e);
      reject(e);
      return;
    }
    
    console.log(`[${movieId}] Torrent added (or reused), waiting for metadata...`);

    const download: ActiveDownload = {
      movieId,
      torrent,
      videoFile: null,
      progress: 0,
      status: 'initializing',
      activeStreams: 0,
      totalSize: 0,
    };

    activeDownloads.set(movieId, download);

    // Log peer connections
    torrent.on('wire', () => {
      console.log(`[${movieId}] Connected to peer, total: ${torrent.numPeers}`);
    });

    torrent.on('noPeers', (announceType: string) => {
      console.log(`[${movieId}] No peers from ${announceType}`);
    });

    torrent.on('warning', (err: Error) => {
      console.warn(`[${movieId}] Warning:`, err.message);
    });

    torrent.on('ready', () => {
      console.log(`[${movieId}] Torrent ready: ${torrent.infoHash}`);
      console.log(`[${movieId}] Files:`, torrent.files.map(f => `${f.name} (${(f.length / 1024 / 1024).toFixed(2)} MB)`));

      // Find the video file
      const videoFile = findVideoFile(torrent.files);

      if (!videoFile) {
        const allFiles = torrent.files.map(f => f.name).join(', ');
        console.error(`[${movieId}] No supported video file found. Files: ${allFiles}`);
        console.error(`[${movieId}] Supported formats: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`);
        download.status = 'error';
        download.error = `No supported video file found. Supported formats: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`;
        movies.updateProgress(movieId, 0, 'added');
        cleanupDownload(movieId, true);
        reject(new Error('No supported video file found in torrent'));
        return;
      }

      console.log(`[${movieId}] Selected video: ${videoFile.name} (${(videoFile.length / 1024 / 1024).toFixed(2)} MB)`);

      // Parse video file name for metadata and fetch from TMDB
      fetchAndUpdateMetadata(movieId, videoFile.name);

      // Deselect all files, then select only the video
      torrent.files.forEach(f => f.deselect());
      videoFile.select();

      download.videoFile = videoFile;
      download.totalSize = videoFile.length;
      download.status = 'downloading';

      resolve();
    });

    torrent.on('download', () => {
      if (download.videoFile) {
        // Use the video file's specific progress
        download.progress = download.videoFile.progress;

        // Update DB only if not already complete (prevent race condition)
        if (download.status !== 'complete') {
          movies.updateProgress(movieId, download.progress, 'downloading');
        }
      }
    });

    torrent.on('done', async () => {
      console.log(`[${movieId}] Download complete!`);
      download.status = 'complete';
      download.progress = 1;

      // Stop seeding - deselect all files to prevent uploading
      torrent.files.forEach(f => f.deselect());
      console.log(`[${movieId}] Stopped seeding`);

      await moveToLibrary(movieId, download);
    });

    torrent.on('error', (err: Error) => {
      console.error(`[${movieId}] Torrent error:`, err);
      download.status = 'error';
      download.error = err.message;
      reject(err);
    });

    // Timeout if torrent doesn't become ready (metadata not found)
    setTimeout(() => {
      if (download.status === 'initializing') {
        console.error(`[${movieId}] Torrent timeout - could not get metadata. The torrent may have no active seeders.`);
        download.status = 'error';
        download.error = 'No seeders found - the torrent may be dead or unavailable';
        movies.updateProgress(movieId, 0, 'added');
        cleanupDownload(movieId, true);
        // Resolve instead of reject to prevent server crash
        resolve();
      }
    }, 120000); // 2 minutes for metadata
  });
}

async function moveToLibrary(movieId: string, download: ActiveDownload): Promise<void> {
  if (!download.videoFile) return;

  const sourcePath = path.join(download.torrent.path, download.videoFile.path);
  const destDir = path.join(config.paths.library, movieId);
  const destPath = path.join(destDir, download.videoFile.name);

  try {
    await fs.mkdir(destDir, { recursive: true });

    // Copy instead of move to avoid issues with active streams
    await fs.copyFile(sourcePath, destPath);
    
    // Get file size from the copied file
    const stats = await fs.stat(destPath);
    const fileSize = stats.size;
    
    movies.updateFilePath(movieId, destPath, fileSize);
    movies.updateProgress(movieId, 1, 'complete');
    console.log(`[${movieId}] File copied to library: ${destPath} (${fileSize} bytes)`);

    // Immediately cleanup the torrent (we have the file in library now)
    cleanupDownload(movieId, true);
  } catch (e) {
    console.error(`[${movieId}] Failed to copy file to library:`, e);
    // Keep using temp location - try to get file size from source
    try {
      const stats = await fs.stat(sourcePath);
      movies.updateFilePath(movieId, sourcePath, stats.size);
    } catch {
      movies.updateFilePath(movieId, sourcePath);
    }
    movies.updateProgress(movieId, 1, 'complete');
    // Keep temp files but still cleanup the torrent (don't delete temp files since they're in use)
    scheduleCleanup(movieId);
  }
}

function scheduleCleanup(movieId: string): void {
  const download = activeDownloads.get(movieId);
  if (!download) return;

  const checkAndCleanup = () => {
    const current = activeDownloads.get(movieId);
    if (!current) return;

    if (current.activeStreams === 0 && current.status === 'complete') {
      console.log(`[${movieId}] Cleaning up torrent`);
      cleanupDownload(movieId, false);
    } else {
      setTimeout(checkAndCleanup, 10000);
    }
  };

  // Initial delay before first cleanup check
  setTimeout(checkAndCleanup, 30000);
}

function cleanupDownload(movieId: string, removeFiles: boolean): void {
  const download = activeDownloads.get(movieId);
  if (!download) return;

  download.torrent.destroy({ destroyStore: removeFiles }, () => {
    console.log(`[${movieId}] Torrent destroyed`);
  });

  activeDownloads.delete(movieId);
}

export interface StreamInfo {
  stream: Readable;
  fileSize: number;
  fileName: string;
  mimeType: string;
  isComplete: boolean;
}

export async function getVideoStream(
  movieId: string,
  start?: number,
  end?: number
): Promise<StreamInfo | null> {
  const movie = movies.getById(movieId);

  // First check if file exists in library (completed downloads)
  if (movie?.filePath && existsSync(movie.filePath)) {
    try {
      const stats = statSync(movie.filePath);
      const fileSize = stats.size;
      const fileName = path.basename(movie.filePath);

      const streamOptions: { start?: number; end?: number } = {};
      if (start !== undefined) streamOptions.start = start;
      if (end !== undefined) streamOptions.end = end;

      return {
        stream: createReadStream(movie.filePath, streamOptions),
        fileSize,
        fileName,
        mimeType: getMimeType(fileName),
        isComplete: true,
      };
    } catch (e) {
      console.error(`Error reading file from library: ${e}`);
    }
  }

  // Check if torrent is active and has video file
  const download = activeDownloads.get(movieId);
  if (download?.videoFile && download.status !== 'error') {
    const videoFile = download.videoFile;
    const fileSize = videoFile.length;
    const fileName = videoFile.name;

    // Track active stream
    download.activeStreams++;

    const streamOptions: { start?: number; end?: number } = {};
    if (start !== undefined) streamOptions.start = start;
    if (end !== undefined) streamOptions.end = end;

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

  return null;
}

export function getDownloadStatus(movieId: string): {
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  peers: number;
  status: 'idle' | 'initializing' | 'downloading' | 'complete' | 'error';
  error?: string;
} | null {
  const download = activeDownloads.get(movieId);

  if (!download) {
    // Check database for completed downloads
    const movie = movies.getById(movieId);
    if (movie?.status === 'complete') {
      return {
        progress: 1,
        downloadSpeed: 0,
        uploadSpeed: 0,
        peers: 0,
        status: 'complete',
      };
    }
    return null;
  }

  // If download is complete, return clean status (no speeds/peers since we're done)
  if (download.status === 'complete') {
    return {
      progress: 1,
      downloadSpeed: 0,
      uploadSpeed: 0,
      peers: 0,
      status: 'complete',
    };
  }

  return {
    progress: download.progress,
    downloadSpeed: download.torrent.downloadSpeed,
    uploadSpeed: download.torrent.uploadSpeed,
    peers: download.torrent.numPeers,
    status: download.status,
    error: download.error,
  };
}

export function isDownloadActive(movieId: string): boolean {
  return activeDownloads.has(movieId) || pendingDownloads.has(movieId);
}

export async function waitForVideoReady(movieId: string, timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const download = activeDownloads.get(movieId);

    if (download?.videoFile && download.status !== 'initializing') {
      // For streaming, we need some data downloaded
      // Check if at least 2% is downloaded or status is complete
      if (download.progress >= 0.02 || download.status === 'complete') {
        return true;
      }
    }

    // Check if file exists in library
    const movie = movies.getById(movieId);
    if (movie?.filePath && existsSync(movie.filePath)) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return false;
}

// Cleanup function for graceful shutdown
export async function shutdownTorrents(): Promise<void> {
  console.log(`Shutting down ${activeDownloads.size} active torrents...`);

  if (client) {
    return new Promise<void>(resolve => {
      client!.destroy(() => {
        activeDownloads.clear();
        client = null;
        console.log('WebTorrent client destroyed');
        resolve();
      });
    });
  }
}

// Cancel an active download for a movie
export async function cancelDownload(movieId: string): Promise<void> {
  console.log(`[${movieId}] Cancelling download...`);

  // Remove from pending downloads if waiting
  pendingDownloads.delete(movieId);

  // If actively downloading, destroy the torrent
  const download = activeDownloads.get(movieId);
  if (download) {
    return new Promise<void>(resolve => {
      download.torrent.destroy({ destroyStore: true }, () => {
        console.log(`[${movieId}] Download cancelled and torrent destroyed`);
        activeDownloads.delete(movieId);
        resolve();
      });
    });
  }
}

// Delete all files associated with a movie from the file system
export async function deleteMovieFiles(movieId: string): Promise<void> {
  console.log(`[${movieId}] Deleting movie files...`);

  const libraryPath = path.join(config.paths.library, movieId);
  const tempPath = path.join(config.paths.temp, movieId);

  // Delete library directory
  try {
    await fs.rm(libraryPath, { recursive: true, force: true });
    console.log(`[${movieId}] Deleted library directory: ${libraryPath}`);
  } catch (e) {
    // Directory may not exist, that's fine
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[${movieId}] Error deleting library directory:`, e);
    }
  }

  // Delete temp directory
  try {
    await fs.rm(tempPath, { recursive: true, force: true });
    console.log(`[${movieId}] Deleted temp directory: ${tempPath}`);
  } catch (e) {
    // Directory may not exist, that's fine
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[${movieId}] Error deleting temp directory:`, e);
    }
  }
}

/**
 * Finalize a download from the temp directory.
 * Called during recovery when a video file already exists in temp but wasn't moved to library.
 */
async function finalizeFromTemp(movieId: string, videoPath: string, fileName: string): Promise<boolean> {
  const destDir = path.join(config.paths.library, movieId);
  const destPath = path.join(destDir, fileName);

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(videoPath, destPath);
    
    const stats = await fs.stat(destPath);
    const fileSize = stats.size;
    
    movies.updateFilePath(movieId, destPath, fileSize);
    movies.updateProgress(movieId, 1, 'complete');
    console.log(`[Recovery] [${movieId}] Finalized from temp: ${destPath} (${fileSize} bytes)`);

    // Clean up temp directory
    const tempDir = path.join(config.paths.temp, movieId);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log(`[Recovery] [${movieId}] Cleaned up temp directory`);
    } catch {
      // Ignore cleanup errors
    }

    return true;
  } catch (e) {
    console.error(`[Recovery] [${movieId}] Failed to finalize from temp:`, e);
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

/**
 * Recover incomplete downloads on server startup.
 * Checks for movies stuck in 'downloading' or 'added' status and either:
 * - Finalizes them if the video file exists in temp
 * - Restarts the download if no file is found
 */
export async function recoverDownloads(): Promise<void> {
  console.log('[Recovery] Checking for incomplete downloads...');
  
  const incompleteMovies = movies.getIncompleteDownloads();
  
  if (incompleteMovies.length === 0) {
    console.log('[Recovery] No incomplete downloads found');
    return;
  }

  console.log(`[Recovery] Found ${incompleteMovies.length} incomplete download(s)`);

  for (const movie of incompleteMovies) {
    const movieId = movie.id;
    const tempDir = path.join(config.paths.temp, movieId);

    // Skip if already being processed
    if (activeDownloads.has(movieId) || pendingDownloads.has(movieId)) {
      console.log(`[Recovery] [${movieId}] Already active, skipping`);
      continue;
    }

    // Check if file exists in library (might already be complete but status not updated)
    if (movie.filePath && existsSync(movie.filePath)) {
      console.log(`[Recovery] [${movieId}] File already in library, marking complete`);
      movies.updateProgress(movieId, 1, 'complete');
      continue;
    }

    // Check if temp directory exists with video file
    if (existsSync(tempDir)) {
      const videoInfo = await findVideoInDirectory(tempDir);
      
      if (videoInfo && videoInfo.size >= MIN_VIDEO_SIZE) {
        console.log(`[Recovery] [${movieId}] Found video in temp: ${videoInfo.name} (${(videoInfo.size / 1024 / 1024).toFixed(2)} MB)`);
        
        const success = await finalizeFromTemp(movieId, videoInfo.path, videoInfo.name);
        if (success) {
          continue;
        }
      }
    }

    // No file found - restart download if magnet link is available
    if (movie.magnetLink) {
      console.log(`[Recovery] [${movieId}] No file found, restarting download`);
      startDownload(movieId, movie.magnetLink).catch(e => {
        console.error(`[Recovery] [${movieId}] Failed to restart download:`, e);
        movies.updateProgress(movieId, 0, 'error');
      });
    } else {
      console.log(`[Recovery] [${movieId}] No magnet link, marking as error`);
      movies.updateProgress(movieId, 0, 'error');
    }
  }
}
