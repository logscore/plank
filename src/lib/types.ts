export type MediaType = "movie" | "show" | "episode";

export type MediaStatus = "pending" | "searching" | "downloading" | "complete" | "error" | "not_found" | "removed";

export interface Media {
	addedAt: Date;
	airDate: string | null;
	backdropUrl: string | null;
	certification: string | null;
	displayOrder: number | null;
	downloadedBytes: number | null;
	episodeNumber: number | null;
	fileIndex: number | null;
	filePath: string | null;
	fileSize: number | null;
	genres: string | null;
	id: string;
	imdbId: string | null;
	infohash: string | null;
	lastPlayedAt: Date | null;
	magnetLink: string | null;
	organizationId: string | null;
	originalLanguage: string | null;
	overview: string | null;
	parentId: string | null;
	playDuration: number | null;
	playPosition: number | null;
	posterUrl: string | null;
	progress: number | null;
	runtime: number | null;
	seasonId: string | null;
	seasonNumber: number | null;
	status: MediaStatus | null;
	stillPath: string | null;
	title: string;
	tmdbId: number | null;
	totalSeasons: number | null;
	type: MediaType;
	userId: string;
	voteAverage: number | null;
	year: number | null;
}

export interface Season {
	episodeCount: number | null;
	id: string;
	mediaId: string;
	name: string | null;
	seasonNumber: number;
}

export type SeasonWithEpisodes = Season & {
	episodes: Media[];
};

export interface CatalogSeason {
	episodeCount: number;
	name: string;
	seasonNumber: number;
}
export interface SubtitleTrackResponse {
	id: string;
	label: string;
	language: string;
	mediaId: string;
	source: string;
	src: string;
}
export interface ProgressInfo {
	downloadSpeed: number;
	fileSize?: number | null;
	peers: number;
	progress: number;
	status: string;
	/** Finalization progress from 0 to 1. Zero unless the status is finalizing. */
	transcodeProgress: number;
}

/** One indexer release a person can pick as a new download source. */
export interface SourceCandidate {
	indexer: string;
	infohash: string;
	magnetUri: string;
	seeders: number;
	size: number;
	title: string;
}

export interface OpenSubtitleResult {
	aiTranslated: boolean;
	downloadCount: number;
	fileId: number;
	fileName: string;
	fps: number;
	fromTrusted: boolean;
	hearingImpaired: boolean;
	id: string;
	language: string;
	languageName: string;
	ratings: number;
	release: string;
}

/** One queued download, plus the episodes that use its files. */
export interface QueueEntry {
	downloadId: string | null;
	downloadInfohash: string | null;
	/** Live torrent stats. Zero when no torrent is running. */
	downloadSpeed: number;
	episodes: QueueEpisode[];
	/** Stable queue identity. Download rows and media-only work use separate prefixes. */
	id: string;
	media: Media;
	peers: number;
	progress: number;
	/** Parent show title. Set only when the owner is an episode. */
	showTitle: string | null;
	sourceTitle: string | null;
	status: string;
	/** Finalization progress from 0 to 1. Zero unless the status is finalizing. */
	transcodeProgress: number;
}

export interface QueueEpisode {
	episodeNumber: number | null;
	id: string;
	progress: number;
	seasonNumber: number | null;
	status: MediaStatus | null;
	title: string;
}
