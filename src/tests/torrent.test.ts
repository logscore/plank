import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as torrentService from '$lib/server/torrent';
import { movies } from '$lib/server/db';

// Mock dependencies
vi.mock('$lib/config', () => ({
  config: {
    paths: {
      temp: '/mock/temp',
      library: '/mock/library',
    },
    tmdb: { apiKey: 'test' }
  }
}));

vi.mock('$lib/server/db', () => ({
  movies: {
    getById: vi.fn(),
    updateProgress: vi.fn(),
    updateMetadata: vi.fn(),
    updateFilePath: vi.fn(),
  }
}));

vi.mock('$lib/server/tmdb', () => ({
  searchMovie: vi.fn().mockResolvedValue([]),
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1000 }),
  }
}));

// Mock WebTorrent
const mockTorrent = {
  infoHash: 'abc1234567890',
  files: [
    { name: 'movie.mp4', length: 100000000, select: vi.fn(), deselect: vi.fn() },
    { name: 'sample.txt', length: 100, select: vi.fn(), deselect: vi.fn() }
  ],
  on: vi.fn(),
  destroy: vi.fn((opts, cb) => cb && cb()),
  downloadSpeed: 1000,
  uploadSpeed: 100,
  numPeers: 5,
  progress: 0.5,
};

const mockClient = {
  add: vi.fn().mockReturnValue(mockTorrent),
  get: vi.fn().mockReturnValue(null),
  destroy: vi.fn((cb) => cb && cb()),
  on: vi.fn(),
};

vi.mock('webtorrent', () => {
  return {
    default: class WebTorrent {
      constructor() {
        return mockClient;
      }
    }
  };
});

vi.mock('parse-torrent', () => ({
  default: vi.fn((link) => {
    if (link.includes('invalid')) throw new Error('Invalid torrent identifier');
    return { infoHash: 'abc1234567890123456789012345678901234567' };
  })
}));

describe('Torrent Service', () => {
  const movieId = 'movie-123';
  const magnet = 'magnet:?xt=urn:btih:abc1234567890123456789012345678901234567';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset internal state if possible or rely on isolation. 
    // Since state is module-level in torrent.ts (activeDownloads), we might need to rely on cancel/shutdown checks.
  });

  afterEach(async () => {
    await torrentService.cancelDownload(movieId);
  });

  describe('startDownload', () => {
    it('should initialize download and add to client', async () => {
      // Mock events on torrent.on
      mockClient.add.mockImplementation((link, opts, cb) => {
        // Trigger ready immediately to resolve promise
        // BUT torrent.ts waits for 'ready' event
        const handlers: Record<string, Function> = {};
        mockTorrent.on.mockImplementation((event, handler) => {
          handlers[event] = handler;
        });
        
        // Return torrent immediately
        return mockTorrent;
      });

      // We need to simulate the 'ready' event being emitted asynchronously
      // However, startDownload awaits the promise returned by initializeDownload
      // which awaits the 'ready' event.
      // We can mock the implementation to fire ready.
      
      const promise = torrentService.startDownload(movieId, magnet);
      
      // We need to find the 'ready' handler key and call it?
      // Since `mockClient.add` is called synchronously, the `mockTorrent.on` calls happen inside.
      // But `startDownload` logic is complex. 
      // Let's rely on the fact that if we can't easily trigger the event from outside, 
      // maybe we should test `isDownloadActive` after calling it?
      // Actually `startDownload` waits for 'ready' to resolve. 
      // If we don't trigger 'ready', it will timeout.
      
      // Let's modify the mock to trigger events.
      mockClient.add.mockImplementation(() => {
         setTimeout(() => {
             // Find the ready callback
             const readyCall = mockTorrent.on.mock.calls.find(call => call[0] === 'ready');
             if (readyCall) readyCall[1]();
         }, 10);
         return mockTorrent;
      });

      await expect(promise).resolves.not.toThrow();
      
      expect(mockClient.add).toHaveBeenCalled();
      expect(movies.updateProgress).toHaveBeenCalledWith(movieId, 0, 'downloading');
    });

    it('should not start if already active', async () => {
      // Fake active state by adding one
      mockClient.add.mockImplementation(() => {
         setTimeout(() => {
             const readyCall = mockTorrent.on.mock.calls.find(call => call[0] === 'ready');
             if (readyCall) readyCall[1]();
         }, 0);
         return mockTorrent;
      });
      await torrentService.startDownload(movieId, magnet);
      
      // Try again
      mockClient.add.mockClear();
      await torrentService.startDownload(movieId, magnet);
      
      expect(mockClient.add).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadStatus', () => {
    it('should return null if not active', () => {
       const status = torrentService.getDownloadStatus('non-existent');
       expect(status).toBeNull();
    });

    it('should return status from active download', async () => {
       // Setup active download
       mockClient.add.mockImplementation(() => {
         setTimeout(() => {
             const readyCall = mockTorrent.on.mock.calls.find(call => call[0] === 'ready');
             if (readyCall) readyCall[1]();
         }, 0);
         return mockTorrent;
      });
      await torrentService.startDownload(movieId, magnet);

      const status = torrentService.getDownloadStatus(movieId);
      expect(status).toBeDefined();
      // progress is 0 initially in startDownload
      expect(status?.progress).toBe(0); 
      expect(status?.downloadSpeed).toBe(1000);
      expect(status?.status).toBe('downloading'); // Status is downloading after startDownload resolves
    });
  });

  describe('cancelDownload', () => {
    it('should destroy torrent and remove from active list', async () => {
       mockClient.add.mockImplementation(() => {
         setTimeout(() => {
             const readyCall = mockTorrent.on.mock.calls.find(call => call[0] === 'ready');
             if (readyCall) readyCall[1]();
         }, 0);
         return mockTorrent;
      });
      await torrentService.startDownload(movieId, magnet);
      
      expect(torrentService.isDownloadActive(movieId)).toBe(true);
      
      await torrentService.cancelDownload(movieId);
      
      expect(mockTorrent.destroy).toHaveBeenCalled();
      expect(torrentService.isDownloadActive(movieId)).toBe(false);
    });
  });
});
