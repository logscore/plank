// Resolves stable library paths for movies shows seasons and episodes
// FEATURE: Shared filesystem layout for media storage and cleanup behavior

import path from 'node:path';
import { config } from '$lib/config';
import { mediaDb } from './db';
import { buildEpisodeFileName, buildShowLibraryDirectoryName } from './media-naming';

interface ShowDirectoryMedia {
	id: string;
	title: string;
	year: number | null;
}

interface EpisodeDirectoryMedia {
	title: string;
	seasonNumber: number | null;
	episodeNumber: number | null;
}

function getExistingShowLibraryRoot(showId: string): string | null {
	const existingEpisode = mediaDb.getEpisodesByParentId(showId).find((episode) => episode.filePath);
	if (!existingEpisode?.filePath) {
		return null;
	}
	return path.dirname(path.dirname(existingEpisode.filePath));
}

export function getShowLibraryRoot(show: ShowDirectoryMedia): string {
	return getExistingShowLibraryRoot(show.id) ?? path.join(config.paths.library, buildShowLibraryDirectoryName(show));
}

export function getShowLibraryDirectoryId(show: ShowDirectoryMedia): string {
	return path.basename(getShowLibraryRoot(show));
}

export function getSeasonLibraryDirectory(show: ShowDirectoryMedia, seasonNumber: number | null): string {
	return path.join(getShowLibraryRoot(show), `Season ${String(seasonNumber ?? 0).padStart(2, '0')}`);
}

export function getEpisodeLibraryPath(
	show: ShowDirectoryMedia,
	episode: EpisodeDirectoryMedia,
	sourceFileName: string
): string {
	return path.join(
		getSeasonLibraryDirectory(show, episode.seasonNumber),
		buildEpisodeFileName(show.title, episode, sourceFileName)
	);
}
