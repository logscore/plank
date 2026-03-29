// Builds deterministic library filenames for movie and episode media
// FEATURE: Metadata-first episodic torrent acquisition naming and library destinations

import path from 'node:path';

const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g;
const WHITESPACE_PATTERN = /\s+/g;
const TRAILING_DOTS_AND_SPACES = /[.\s]+$/g;

function stripControlCharacters(value: string): string {
	return Array.from(value)
		.filter((character) => character.charCodeAt(0) >= 32)
		.join('');
}

function sanitizeFileSegment(value: string, fallback: string): string {
	const sanitized = value.replace(INVALID_FILENAME_CHARACTERS, ' ').trim();
	const cleaned = stripControlCharacters(sanitized)
		.replace(WHITESPACE_PATTERN, ' ')
		.replace(TRAILING_DOTS_AND_SPACES, '')
		.trim();
	return cleaned || fallback;
}

function getSafeExtension(sourceFileName: string): string {
	const extension = path.extname(sourceFileName).trim();
	return extension || '.mp4';
}

export function buildMovieFileName(media: { title: string; year: number | null }, sourceFileName: string): string {
	const title = sanitizeFileSegment(media.title, 'Unknown Movie');
	const extension = getSafeExtension(sourceFileName);
	if (media.year) {
		return `${title} (${media.year})${extension}`;
	}
	return `${title}${extension}`;
}

export function buildMovieLibraryDirectoryName(movie: { title: string; year: number | null; id?: string }): string {
	const title = sanitizeFileSegment(movie.title, movie.id ?? 'Unknown Movie');
	if (movie.year) {
		return `${title} (${movie.year})`;
	}
	return title;
}

export function buildShowLibraryDirectoryName(show: { title: string; year: number | null; id?: string }): string {
	const title = sanitizeFileSegment(show.title, show.id ?? 'Unknown Show');
	if (show.year) {
		return `${title} (${show.year})`;
	}
	return title;
}

export function buildEpisodeFileName(
	showTitle: string,
	episode: { seasonNumber: number | null; episodeNumber: number | null; title: string },
	sourceFileName: string
): string {
	const show = sanitizeFileSegment(showTitle, 'Unknown Show');
	const seasonNumber = String(episode.seasonNumber ?? 0).padStart(2, '0');
	const episodeNumber = String(episode.episodeNumber ?? 0).padStart(2, '0');
	const title = sanitizeFileSegment(episode.title, `Episode ${episodeNumber}`);
	const extension = getSafeExtension(sourceFileName);
	return `${show} - S${seasonNumber}E${episodeNumber} - ${title}${extension}`;
}
