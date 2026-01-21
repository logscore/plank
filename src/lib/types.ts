// Client-safe types (these match the Drizzle schema but don't import server modules)

export interface Movie {
	id: string;
	userId: string;
	title: string;
	year: number | null;
	posterUrl: string | null;
	backdropUrl: string | null;
	overview: string | null;
	magnetLink: string;
	infohash: string;
	filePath: string | null;
	fileSize: number | null;
	status: 'added' | 'downloading' | 'complete' | 'error' | null;
	progress: number | null;
	tmdbId: number | null;
	runtime: number | null;
	genres: string | null;
	originalLanguage: string | null;
	certification: string | null;
	addedAt: Date;
	lastPlayedAt: Date | null;
}

export interface User {
	id: string;
	email: string;
	name: string;
	emailVerified: boolean;
	image: string | null;
}
