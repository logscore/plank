import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { movies } from '$lib/server/db';
import { getDownloadStatus, isDownloadActive } from '$lib/server/torrent';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const movie = movies.get(params.id, locals.user.id);
  if (!movie) throw error(404, 'Movie not found');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isComplete = movie.status === 'complete';
      let isClosed = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };

      const closeStream = () => {
        if (isClosed) return;
        isClosed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };
      
      const sendData = () => {
        if (isClosed) return;
        
        try {
          const downloadStatus = getDownloadStatus(params.id);
          const currentMovie = movies.get(params.id, locals.user!.id);
          
          const data = {
            status: downloadStatus?.status ?? currentMovie?.status ?? 'added',
            progress: downloadStatus?.progress ?? currentMovie?.progress ?? 0,
            downloadSpeed: downloadStatus?.downloadSpeed ?? 0,
            uploadSpeed: downloadStatus?.uploadSpeed ?? 0,
            peers: downloadStatus?.peers ?? 0,
            isActive: isDownloadActive(params.id),
            filePath: currentMovie?.filePath,
            error: downloadStatus?.error,
          };
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          
          // Stop streaming when complete
          if (data.status === 'complete' && !isComplete) {
            isComplete = true;
            // Send one final update then close
            setTimeout(closeStream, 500);
          }
        } catch (e) {
          console.error('SSE error:', e);
          closeStream();
        }
      };

      // Send initial data immediately
      sendData();

      // If already complete, close after sending
      if (isComplete) {
        setTimeout(closeStream, 100);
        return;
      }

      // Send updates every second
      interval = setInterval(sendData, 1000);
    },
    cancel() {
      // Stream was cancelled by client
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
