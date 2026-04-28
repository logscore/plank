export type MediaType = 'movie' | 'show' | 'episode';

export type MediaStatus = 'pending' | 'searching' | 'downloading' | 'complete' | 'error' | 'not_found' | 'removed';

export interface BrowseItem {
	id: string;
	tmdbId: number;
	imdbId: string | null;
	title: string;
	year: number | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	overview: string | null;
	voteAverage: number | null;
	genres: string[];
	mediaType: 'movie' | 'show';
	certification: string | null;
	needsResolve: boolean;
	runtime: number | null;
	originalLanguage: string | null;
	totalSeasons: number | null;
	availableSeasons?: DemoSeasonSummary[];
}

export interface DemoSeasonSummary {
	seasonNumber: number;
	name: string;
	episodeCount: number;
	year?: number;
	posterPath?: string;
	overview?: string | null;
	airDate?: string | null;
}

export interface Media {
	id: string;
	profileId: string | null;
	type: MediaType;
	title: string;
	overview: string | null;
	year: number | null;
	tmdbId: number | null;
	imdbId: string | null;
	runtime: number | null;
	originalLanguage: string | null;
	addedAt: string;
	createdAt: string;
	posterUrl: string | null;
	backdropUrl: string | null;
	genres: string[];
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
	lastPlayedAt: string | null;
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
	createdAt: string;
}

export type SeasonWithEpisodes = Season & {
	episodes: Media[];
};

export interface DemoProfile {
	id: string;
	name: string;
	logo: string | null;
	color: string | null;
	isMember: boolean;
	memberCount: number;
	createdAt: string;
}

export interface DemoUser {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: 'admin' | 'user';
}

export interface DemoMember {
	id: string;
	name: string;
	email: string;
	role: 'owner' | 'admin' | 'member';
	image: string | null;
}

export interface DemoInvitation {
	id: string;
	email: string;
	profileId: string;
	profileName: string;
	status: 'pending' | 'accepted';
	createdAt: string;
}

export interface DemoIndexer {
	id: string;
	name: string;
	kind: string;
	status: 'connected' | 'limited' | 'offline';
}

export interface DemoSettings {
	tmdbApiKey: string;
	opensubtitlesApiKey: string;
	opensubtitlesUsername: string;
	opensubtitlesPassword: string;
	prowlarrUrl: string;
	prowlarrApiKey: string;
	trustedGroups: string[];
	minSeeders: number;
	indexers: DemoIndexer[];
}

export interface DemoState {
	user: DemoUser;
	activeProfileId: string | null;
	profiles: DemoProfile[];
	members: Record<string, DemoMember[]>;
	invitations: DemoInvitation[];
	settings: DemoSettings;
	libraries: Record<string, Media[]>;
	seasons: Record<string, Record<string, SeasonWithEpisodes[]>>;
}
