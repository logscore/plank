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

export interface FetchError extends Error {
	status?: number;
}
