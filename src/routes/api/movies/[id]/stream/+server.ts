import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { movies } from '$lib/server/db';
import {
  getVideoStream,
  getDownloadStatus,
  startDownload,
  isDownloadActive,
  waitForVideoReady,
} from '$lib/server/torrent';
import { needsTransmux, createTransmuxStream } from '$lib/server/transcoder';

export const GET: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const movie = movies.get(params.id, locals.user.id);
  if (!movie) throw error(404, 'Movie not found');

  // Check current download status first
  let status = getDownloadStatus(movie.id);

  // If there was a previous error, report it
  if (status?.status === 'error') {
    throw error(503, status.error || 'Download failed - torrent may have no seeders');
  }

  // If movie hasn't started downloading yet, start it
  if (movie.status === 'added' && !isDownloadActive(movie.id)) {
    try {
      await startDownload(movie.id, movie.magnetLink);
    } catch (e) {
      console.error('Failed to start download:', e);
      throw error(500, 'Failed to start download');
    }
  }

  // Check status again after starting
  status = getDownloadStatus(movie.id);
  if (status?.status === 'error') {
    throw error(503, status.error || 'Download failed - torrent may have no seeders');
  }

  // Wait for video to be ready (with timeout)
  const isReady = await waitForVideoReady(movie.id, 30000);

  if (!isReady) {
    status = getDownloadStatus(movie.id);
    if (status?.status === 'error') {
      throw error(503, status.error || 'Download failed');
    }
    if (status?.status === 'initializing') {
      throw error(202, 'Torrent is initializing, please try again shortly');
    }
    throw error(202, 'Video is buffering, please wait...');
  }

  // Get stream info to determine file details
  const streamInfo = await getVideoStream(params.id);
  if (!streamInfo) {
    throw error(404, 'Video not available');
  }

  const { fileSize, fileName } = streamInfo;

  // Check if file needs transmuxing (MKV, AVI, etc.)
  if (needsTransmux(fileName)) {
    console.log(`[Stream] Transmuxing ${fileName} to MP4`);

    // For transmuxed streams, we can't support range requests easily
    // Stream the whole file through ffmpeg
    const transmuxedStream = createTransmuxStream({
      inputStream: streamInfo.stream,
      onError: (err) => {
        console.error('[Stream] Transmux error:', err);
      },
    });

    return new Response(transmuxedStream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `inline; filename="${fileName.replace(/\.[^.]+$/, '.mp4')}"`,
        'Cache-Control': 'no-cache',
        // No Content-Length since transmuxing changes the size
      },
    });
  }

  // For natively playable formats (MP4, WebM), support range requests
  const range = request.headers.get('range');
  const mimeType = streamInfo.mimeType;

  if (range) {
    // Close the initial stream since we need a ranged one
    streamInfo.stream.destroy();

    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Validate range
    if (isNaN(start) || start < 0 || start >= fileSize) {
      throw error(416, 'Requested range not satisfiable');
    }

    // Clamp end to file size
    const clampedEnd = Math.min(end, fileSize - 1);

    // Get stream with range
    const rangedStreamInfo = await getVideoStream(params.id, start, clampedEnd);
    if (!rangedStreamInfo) {
      throw error(500, 'Failed to create ranged stream');
    }

    const contentLength = clampedEnd - start + 1;

    return new Response(rangedStreamInfo.stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength.toString(),
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': rangedStreamInfo.isComplete ? 'private, max-age=3600' : 'no-cache',
      },
    });
  }

  // Full file response for native formats
  return new Response(streamInfo.stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize.toString(),
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': streamInfo.isComplete ? 'private, max-age=3600' : 'no-cache',
    },
  });
};
