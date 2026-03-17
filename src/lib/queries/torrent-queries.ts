export interface TorrentSearchParams {
	q?: string;
	category?: string;
	quality?: string;
	minSize?: number;
	maxSize?: number;
	minSeeders?: number;
	trustedGroups?: boolean;
	sort?: 'relevance' | 'size' | 'seeders' | 'date';
	order?: 'asc' | 'desc';
	page?: number;
	limit?: number;
}

export interface TorrentResult {
	title: string;
	magnetLink: string;
	infohash: string;
	size: number;
	seeders: number;
	leechers: number;
	uploadDate: string;
	category: string;
	quality?: string;
	releaseGroup?: string;
}

export interface TorrentSearchResponse {
	results: TorrentResult[];
	total: number;
	page: number;
	totalPages: number;
	hasNext: boolean;
	hasPrev: boolean;
}
