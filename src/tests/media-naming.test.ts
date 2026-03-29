import { describe, expect, it } from 'vitest';
import { buildEpisodeFileName, buildMovieFileName, buildMovieLibraryDirectoryName } from '$lib/server/media-naming';

describe('media naming', () => {
	it('builds deterministic movie filenames', () => {
		expect(buildMovieFileName({ title: 'Alien', year: 1979 }, 'Alien.1979.mkv')).toBe('Alien (1979).mkv');
		expect(buildMovieFileName({ title: 'Unknown Movie', year: null }, 'movie.mp4')).toBe('Unknown Movie.mp4');
	});

	it('builds deterministic episode filenames', () => {
		expect(
			buildEpisodeFileName(
				'Breaking Bad',
				{ seasonNumber: 1, episodeNumber: 1, title: 'Pilot' },
				'breaking.bad.s01e01.mkv'
			)
		).toBe('Breaking Bad - S01E01 - Pilot.mkv');
	});

	it('builds deterministic movie directory names', () => {
		expect(buildMovieLibraryDirectoryName({ title: 'Alien', year: 1979 })).toBe('Alien (1979)');
		expect(buildMovieLibraryDirectoryName({ title: 'Alien', year: null })).toBe('Alien');
	});
});
