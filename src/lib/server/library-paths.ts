// Resolves stable library paths for movies shows seasons and episodes
// FEATURE: Shared filesystem layout for media storage and cleanup behavior

import path from 'node:path';
import { mediaDb } from './db';
import { buildEpisodeFileName, buildMovieLibraryDirectoryName, buildShowLibraryDirectoryName } from './media-naming';
import { buildOrganizationStorageKey } from './storage';

interface MovieDirectoryMedia {
	id: string;
	title: string;
	year: number | null;
	organizationId?: string | null;
	filePath?: string | null;
}

interface ShowDirectoryMedia {
	id: string;
	title: string;
	year: number | null;
	organizationId?: string | null;
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

export function getMovieLibraryRoot(movie: MovieDirectoryMedia): string {
	if (movie.filePath) {
		return path.dirname(movie.filePath);
	}
	return buildOrganizationStorageKey(movie.organizationId, 'library', buildMovieLibraryDirectoryName(movie));
}

export function getMovieLibraryDirectoryId(movie: MovieDirectoryMedia): string {
	return path.basename(getMovieLibraryRoot(movie));
}

export function getShowLibraryRoot(show: ShowDirectoryMedia): string {
	return (
		getExistingShowLibraryRoot(show.id) ??
		buildOrganizationStorageKey(show.organizationId, 'library', buildShowLibraryDirectoryName(show))
	);
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
