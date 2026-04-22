import type { Media } from '$lib/types';

export function canPlayEpisode(episode: Pick<Media, 'filePath' | 'fileIndex' | 'status'>): boolean {
	return Boolean(
		episode.filePath ||
			episode.fileIndex !== null ||
			episode.status === 'complete' ||
			episode.status === 'downloading'
	);
}
