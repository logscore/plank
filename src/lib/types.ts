// Client-safe types (these match the Drizzle schema but don't import server modules)

export type MediaType = 'movie' | 'tv';
export type MediaStatus = 'added' | 'downloading' | 'complete' | 'error';
export type EpisodeStatus = 'pending' | 'downloading' | 'complete' | 'error';

export interface Media {
	id: string;
	userId: string;
	type: MediaType;
	title: string;
	year: number | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	overview: string | null;
	magnetLink: string;
	infohash: string;
	filePath: string | null;
	fileSize: number | null;
	status: MediaStatus | null;
	progress: number | null;
	tmdbId: number | null;
	runtime: number | null;
	genres: string | null;
	originalLanguage: string | null;
	certification: string | null;
	totalSeasons: number | null; // TV shows only
	addedAt: Date;
	lastPlayedAt: Date | null;
	playPosition: number | null;
	playDuration: number | null;
}

interface Season {
	id: string;
	mediaId: string;
	seasonNumber: number;
	name: string | null;
	overview: string | null;
	posterPath: string | null;
	airDate: string | null;
	episodeCount: number | null;
	createdAt: Date;
	episodes?: Episode[];
}

export interface Episode {
	id: string;
	seasonId: string;
	episodeNumber: number;
	title: string | null;
	overview: string | null;
	stillPath: string | null;
	runtime: number | null;
	airDate: string | null;
	fileIndex: number | null;
	filePath: string | null;
	fileSize: number | null;
	downloadedBytes: number | null;
	displayOrder: number;
	status: EpisodeStatus | null;
	playPosition: number | null;
	playDuration: number | null;
	createdAt: Date;
}

// API response types

export interface SeasonWithEpisodes extends Season {
	episodes: Episode[];
}

// Subtitle types

export type SubtitleSource = 'sidecar' | 'embedded' | 'opensubtitles' | 'manual';

export interface SubtitleTrack {
	id: string;
	mediaId: string;
	episodeId: string | null;
	language: string;
	label: string;
	source: SubtitleSource;
	isDefault: boolean;
	src: string;
}

// TMDB search result types

// Episode reorder request type
