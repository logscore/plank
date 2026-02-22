import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '$lib/config';
import { getSettings } from './settings';

const BASE_URL = 'https://api.opensubtitles.com/api/v1';
const USER_AGENT = 'plank-media v0.1.0';
const SAFE_FILENAME_REGEX = /[^a-zA-Z0-9._-]/g;
const IMDB_PREFIX_REGEX = /^tt/;

// ============================================================================
// Types
// ============================================================================

interface OpenSubtitlesSearchParams {
	tmdbId?: number;
	imdbId?: string;
	query?: string;
	year?: number;
	seasonNumber?: number;
	episodeNumber?: number;
	languages?: string; // comma-separated ISO 639-1 codes (e.g. "en,es,fr")
}

interface OSAttributes {
	subtitle_id: string;
	language: string;
	download_count: number;
	hearing_impaired: boolean;
	hd: boolean;
	fps: number;
	votes: number;
	points: number | null;
	ratings: number;
	from_trusted: boolean;
	foreign_parts_only: boolean;
	ai_translated: boolean;
	machine_translated: boolean;
	upload_date: string;
	release: string;
	comments: string;
	legacy_subtitle_id: number;
	feature_details: {
		feature_id: number;
		feature_type: string;
		year: number;
		title: string;
		movie_name: string;
		imdb_id: number;
		tmdb_id: number;
		season_number?: number;
		episode_number?: number;
		parent_title?: string;
		parent_imdb_id?: number;
		parent_tmdb_id?: number;
	};
	files: Array<{
		file_id: number;
		cd_number: number;
		file_name: string;
	}>;
}

interface OSSearchResponse {
	total_pages: number;
	total_count: number;
	per_page: number;
	page: number;
	data: Array<{
		id: string;
		type: string;
		attributes: OSAttributes;
	}>;
}

interface OSDownloadResponse {
	link: string;
	file_name: string;
	requests: number;
	remaining: number;
	message: string;
	reset_time: string;
	reset_time_utc: string;
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

// ISO 639-1 to language name mapping for display
const LANGUAGE_NAMES: Record<string, string> = {
	en: 'English',
	es: 'Spanish',
	fr: 'French',
	de: 'German',
	it: 'Italian',
	pt: 'Portuguese',
	ja: 'Japanese',
	ko: 'Korean',
	zh: 'Chinese',
	ar: 'Arabic',
	ru: 'Russian',
	hi: 'Hindi',
	pl: 'Polish',
	tr: 'Turkish',
	nl: 'Dutch',
	sv: 'Swedish',
	no: 'Norwegian',
	da: 'Danish',
	fi: 'Finnish',
	cs: 'Czech',
	ro: 'Romanian',
	hu: 'Hungarian',
	el: 'Greek',
	he: 'Hebrew',
	th: 'Thai',
	vi: 'Vietnamese',
	id: 'Indonesian',
	ms: 'Malay',
	uk: 'Ukrainian',
	bg: 'Bulgarian',
	hr: 'Croatian',
	sr: 'Serbian',
	sk: 'Slovak',
	sl: 'Slovenian',
};

// ISO 639-1 to ISO 639-2/B mapping for DB storage (matching existing LANGUAGE_MAP in subtitles.ts)
const ISO1_TO_ISO2: Record<string, string> = {
	en: 'eng',
	es: 'spa',
	fr: 'fre',
	de: 'ger',
	it: 'ita',
	pt: 'por',
	ja: 'jpn',
	ko: 'kor',
	zh: 'chi',
	ar: 'ara',
	ru: 'rus',
	hi: 'hin',
	pl: 'pol',
	tr: 'tur',
	nl: 'nld',
	sv: 'swe',
	no: 'nor',
	da: 'dan',
	fi: 'fin',
	cs: 'ces',
	ro: 'ron',
	hu: 'hun',
	el: 'ell',
	he: 'heb',
	th: 'tha',
	vi: 'vie',
	id: 'ind',
	ms: 'msa',
	uk: 'ukr',
	bg: 'bul',
	hr: 'hrv',
	sr: 'srp',
	sk: 'slk',
	sl: 'slv',
};

function getLanguageName(code: string): string {
	return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

function getIso2Code(iso1Code: string): string {
	return ISO1_TO_ISO2[iso1Code] ?? iso1Code;
}

async function getApiKey(): Promise<string> {
	const settings = await getSettings();
	return settings.opensubtitles.apiKey;
}

function buildHeaders(apiKey: string): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		'Api-Key': apiKey,
		'User-Agent': USER_AGENT,
	};
}

// ============================================================================
// Search
// ============================================================================

export async function searchSubtitles(params: OpenSubtitlesSearchParams): Promise<OpenSubtitleResult[]> {
	const apiKey = await getApiKey();
	if (!apiKey) {
		throw new Error('OpenSubtitles API key not configured');
	}

	const searchParams = new URLSearchParams();

	if (params.tmdbId) {
		searchParams.set('tmdb_id', String(params.tmdbId));
	}
	if (params.imdbId) {
		// OpenSubtitles expects numeric IMDB ID without "tt" prefix
		const numericId = params.imdbId.replace(IMDB_PREFIX_REGEX, '');
		searchParams.set('imdb_id', numericId);
	}
	if (params.query) {
		searchParams.set('query', params.query);
	}
	if (params.year) {
		searchParams.set('year', String(params.year));
	}
	if (params.seasonNumber !== undefined) {
		searchParams.set('season_number', String(params.seasonNumber));
	}
	if (params.episodeNumber !== undefined) {
		searchParams.set('episode_number', String(params.episodeNumber));
	}
	if (params.languages) {
		searchParams.set('languages', params.languages);
	}

	// Sort by download count to get best results first
	searchParams.set('order_by', 'download_count');
	searchParams.set('order_direction', 'desc');

	const url = `${BASE_URL}/subtitles?${searchParams.toString()}`;

	const response = await fetch(url, {
		headers: buildHeaders(apiKey),
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`[OpenSubtitles] Search failed: ${response.status} ${text}`);
		throw new Error(`OpenSubtitles search failed: ${response.status}`);
	}

	const data: OSSearchResponse = await response.json();

	return data.data.map((item) => {
		const attr = item.attributes;
		const file = attr.files[0];

		// Determine if this is an exact match based on TMDB ID
		const isExactMatch = params.tmdbId
			? attr.feature_details.tmdb_id === params.tmdbId
			: attr.feature_details.title?.toLowerCase() === params.query?.toLowerCase();

		return {
			id: item.id,
			fileId: file?.file_id ?? 0,
			fileName: file?.file_name ?? 'unknown',
			language: attr.language,
			languageName: getLanguageName(attr.language),
			release: attr.release,
			downloadCount: attr.download_count,
			hearingImpaired: attr.hearing_impaired,
			aiTranslated: attr.ai_translated,
			machineTranslated: attr.machine_translated,
			fromTrusted: attr.from_trusted,
			fps: attr.fps,
			votes: attr.votes,
			ratings: attr.ratings,
			uploadDate: attr.upload_date,
			isExactMatch: !!isExactMatch,
			featureTitle: attr.feature_details.movie_name || attr.feature_details.title,
			featureYear: attr.feature_details.year,
			seasonNumber: attr.feature_details.season_number,
			episodeNumber: attr.feature_details.episode_number,
		};
	});
}

// ============================================================================
// Download
// ============================================================================

export async function downloadSubtitle(
	fileId: number,
	mediaId: string
): Promise<{ filePath: string; fileName: string }> {
	const apiKey = await getApiKey();
	if (!apiKey) {
		throw new Error('OpenSubtitles API key not configured');
	}

	// Step 1: Get download link
	const response = await fetch(`${BASE_URL}/download`, {
		method: 'POST',
		headers: buildHeaders(apiKey),
		body: JSON.stringify({ file_id: fileId }),
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`[OpenSubtitles] Download request failed: ${response.status} ${text}`);
		throw new Error(`OpenSubtitles download failed: ${response.status}`);
	}

	const downloadInfo: OSDownloadResponse = await response.json();

	// Step 2: Fetch the actual subtitle file
	const fileResponse = await fetch(downloadInfo.link);
	if (!fileResponse.ok) {
		throw new Error(`Failed to download subtitle file: ${fileResponse.status}`);
	}

	const content = await fileResponse.text();

	// Step 3: Save to disk
	const subtitleDir = path.join(config.paths.library, mediaId, 'subtitles');
	await fs.mkdir(subtitleDir, { recursive: true });

	// Use a unique filename based on the original plus a timestamp
	const baseName = path.basename(downloadInfo.file_name, path.extname(downloadInfo.file_name));
	const safeName = baseName.replace(SAFE_FILENAME_REGEX, '_');
	const fileName = `${safeName}_${Date.now()}.srt`;
	const filePath = path.join(subtitleDir, fileName);

	await fs.writeFile(filePath, content, 'utf-8');

	// Step 4: Convert to VTT if needed (SRT is most common from OpenSubtitles)
	const { convertSubtitleToVtt } = await import('./ffmpeg');
	const vttFileName = `${safeName}_${Date.now()}.vtt`;
	const vttPath = path.join(subtitleDir, vttFileName);

	try {
		await convertSubtitleToVtt(filePath, vttPath);
		// Clean up the original SRT
		await fs.unlink(filePath).catch(() => undefined);
		return { filePath: vttPath, fileName: downloadInfo.file_name };
	} catch {
		// If conversion fails, try serving the SRT directly
		console.error('[OpenSubtitles] VTT conversion failed, keeping SRT');
		return { filePath, fileName: downloadInfo.file_name };
	}
}

// ============================================================================
// Available languages for the UI
// ============================================================================

export const AVAILABLE_LANGUAGES = Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
	code,
	name,
	iso2: getIso2Code(code),
}));

export { getLanguageName, getIso2Code };
