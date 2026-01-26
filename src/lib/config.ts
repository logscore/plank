import { env } from '$env/dynamic/private';

export const config = {
	paths: {
		data: env.DATA_PATH || './data',
		get library() {
			return `${this.data}/library`;
		},
		get temp() {
			return `${this.data}/temp`;
		},
	},
	tmdb: {
		apiKey: env.TMDB_API_KEY || '',
		baseUrl: 'https://api.themoviedb.org/3',
		imageBaseUrl: 'https://image.tmdb.org/t/p',
	},
	prowlarr: {
		url: env.PROWLARR_URL || 'http://localhost:9696',
		apiKey: env.PROWLARR_API_KEY || '',
		// Trusted release groups for high-quality content
		trustedGroups: ['YTS', 'YIFY', '.BONE.', 'x1337', 'TVTEAM'],
		// Minimum seeders for a valid torrent
		minSeeders: 5,
	},
};
