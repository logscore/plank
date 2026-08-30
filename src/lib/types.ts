export type MediaType = "movie" | "show" | "episode";

export type MediaStatus = "pending" | "searching" | "downloading" | "complete" | "error" | "not_found" | "removed";

export interface Media {
	id: string;
	userId: string;
	organizationId: string | null;
	type: MediaType;
	title: string;
	overview: string | null;
	year: number | null;
	voteAverage: number | null;
	tmdbId: number | null;
	imdbId: string | null;
	runtime: number | null;
	originalLanguage: string | null;
	addedAt: Date;
	createdAt: Date;
	posterUrl: string | null;
	backdropUrl: string | null;
	genres: string | null;
	certification: string | null;
	totalSeasons: number | null;
	parentId: string | null;
	seasonId: string | null;
	episodeNumber: number | null;
	seasonNumber: number | null;
	displayOrder: number | null;
	stillPath: string | null;
	airDate: string | null;
	magnetLink: string | null;
	infohash: string | null;
	status: MediaStatus | null;
	progress: number | null;
	filePath: string | null;
	fileSize: number | null;
	fileIndex: number | null;
	downloadedBytes: number | null;
	playPosition: number | null;
	playDuration: number | null;
	lastPlayedAt: Date | null;
}

export interface Season {
	id: string;
	mediaId: string;
	seasonNumber: number;
	name: string | null;
	overview: string | null;
	posterPath: string | null;
	airDate: string | null;
	episodeCount: number | null;
	createdAt: Date;
}

export type SeasonWithEpisodes = Season & {
	episodes: Media[];
};

export interface CatalogSeason {
	seasonNumber: number;
	name: string;
	episodeCount: number;
	year?: number;
	posterPath?: string;
}
export interface SubtitleTrackResponse {
	id: string;
	mediaId: string;
	language: string;
	label: string;
	source: string;
	isDefault: boolean;
	isForced: boolean;
	src: string;
}
export interface ProgressInfo {
	status: string;
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	peers: number;
	isActive: boolean;
	filePath: string | null;
	fileSize?: number;
}

/** One indexer release a person can pick as a new download source. */
export interface SourceCandidate {
	title: string;
	magnetUri: string;
	infohash: string;
	size: number;
	seeders: number;
	peers: number;
	publishDate: string;
	indexer: string;
}

export interface OpenSubtitleResult {
	id: string;
	fileId: number;
	fileName: string;
	language: string;
	languageName: string;
	release: string;
	downloadCount: number;
	hearingImpaired: boolean;
	aiTranslated: boolean;
	machineTranslated: boolean;
	fromTrusted: boolean;
	fps: number;
	votes: number;
	ratings: number;
	uploadDate: string;
	isExactMatch: boolean;
	featureTitle: string;
	featureYear: number;
	seasonNumber?: number;
	episodeNumber?: number;
}
