import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Media } from "$lib/server/db/schema";
import type { OpenSubtitleResult } from "$lib/types";
import { mediaDb } from "./db";
import { sanitizeFilename } from "./images";
import { getMovieLibraryRoot, getSeasonLibraryDirectory } from "./paths";
import { getSettings } from "./settings";

const BASE_URL = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "plank-media v0.1.0";
const IMDB_PREFIX_REGEX = /^tt/;

// ============================================================================
// Types
// ============================================================================

interface OpenSubtitlesSearchParams {
	episodeNumber?: number;
	imdbId?: string;
	languages?: string; // comma-separated ISO 639-1 codes (e.g. "en,es,fr")
	parentImdbId?: string;
	parentTmdbId?: number;
	query?: string;
	seasonNumber?: number;
	tmdbId?: number;
	year?: number;
}

interface OSAttributes {
	ai_translated: boolean;
	download_count: number;
	files: Array<{
		file_id: number;
		file_name: string;
	}>;
	fps: number;
	from_trusted: boolean;
	hearing_impaired: boolean;
	language: string;
	ratings: number;
	release: string;
}

interface OSSearchResponse {
	data: Array<{
		id: string;
		attributes: OSAttributes;
	}>;
}

interface OSDownloadResponse {
	file_name: string;
	link: string;
}

interface OSLoginResponse {
	token: string;
}

// ISO 639-1 to language name mapping for display
const LANGUAGE_NAMES: Record<string, string> = {
	ar: "Arabic",
	bg: "Bulgarian",
	cs: "Czech",
	da: "Danish",
	de: "German",
	el: "Greek",
	en: "English",
	es: "Spanish",
	fi: "Finnish",
	fr: "French",
	he: "Hebrew",
	hi: "Hindi",
	hr: "Croatian",
	hu: "Hungarian",
	id: "Indonesian",
	it: "Italian",
	ja: "Japanese",
	ko: "Korean",
	ms: "Malay",
	nl: "Dutch",
	no: "Norwegian",
	pl: "Polish",
	pt: "Portuguese",
	ro: "Romanian",
	ru: "Russian",
	sk: "Slovak",
	sl: "Slovenian",
	sr: "Serbian",
	sv: "Swedish",
	th: "Thai",
	tr: "Turkish",
	uk: "Ukrainian",
	vi: "Vietnamese",
	zh: "Chinese",
};

// ISO 639-1 to ISO 639-2/B mapping for DB storage (matching existing LANGUAGE_MAP in subtitles.ts)
const ISO1_TO_ISO2: Record<string, string> = {
	ar: "ara",
	bg: "bul",
	cs: "ces",
	da: "dan",
	de: "ger",
	el: "ell",
	en: "eng",
	es: "spa",
	fi: "fin",
	fr: "fre",
	he: "heb",
	hi: "hin",
	hr: "hrv",
	hu: "hun",
	id: "ind",
	it: "ita",
	ja: "jpn",
	ko: "kor",
	ms: "msa",
	nl: "nld",
	no: "nor",
	pl: "pol",
	pt: "por",
	ro: "ron",
	ru: "rus",
	sk: "slk",
	sl: "slv",
	sr: "srp",
	sv: "swe",
	th: "tha",
	tr: "tur",
	uk: "ukr",
	vi: "vie",
	zh: "chi",
};

export function getLanguageName(code: string): string {
	return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

export function getIso2Code(iso1Code: string): string {
	return ISO1_TO_ISO2[iso1Code] ?? iso1Code;
}

async function getApiKey(): Promise<string> {
	const settings = await getSettings();
	return settings.opensubtitles.apiKey;
}

async function getCredentials(): Promise<{ username: string; password: string }> {
	const settings = await getSettings();
	return {
		password: settings.opensubtitles.password,
		username: settings.opensubtitles.username,
	};
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

function buildHeaders(apiKey: string, token?: string): Record<string, string> {
	const headers: Record<string, string> = {
		"Api-Key": apiKey,
		"Content-Type": "application/json",
		"User-Agent": USER_AGENT,
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	return headers;
}

async function login(apiKey: string): Promise<string> {
	const { username, password } = await getCredentials();
	if (!(username && password)) {
		throw new Error("OpenSubtitles credentials not configured");
	}

	const response = await fetch(`${BASE_URL}/login`, {
		body: JSON.stringify({ password, username }),
		headers: buildHeaders(apiKey),
		method: "POST",
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`[OpenSubtitles] Login failed: ${response.status} ${text}`);
		throw new Error(`OpenSubtitles login failed: ${response.status}`);
	}

	const data: OSLoginResponse = await response.json();
	cachedToken = data.token;
	tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
	return data.token;
}

async function getValidToken(apiKey: string): Promise<string | null> {
	const { username, password } = await getCredentials();
	if (!(username && password)) {
		return null;
	}

	if (cachedToken && Date.now() < tokenExpiry) {
		return cachedToken;
	}

	return login(apiKey);
}

// ============================================================================
// Search
// ============================================================================

export async function searchSubtitles(params: OpenSubtitlesSearchParams): Promise<OpenSubtitleResult[]> {
	const apiKey = await getApiKey();
	if (!apiKey) {
		throw new Error("OpenSubtitles API key not configured");
	}

	const searchParams = new URLSearchParams();

	if (params.tmdbId) {
		searchParams.set("tmdb_id", String(params.tmdbId));
	}
	if (params.imdbId) {
		// OpenSubtitles expects numeric IMDB ID without "tt" prefix
		const numericId = params.imdbId.replace(IMDB_PREFIX_REGEX, "");
		searchParams.set("imdb_id", numericId);
	}
	if (params.parentTmdbId) {
		searchParams.set("parent_tmdb_id", String(params.parentTmdbId));
	}
	if (params.parentImdbId) {
		searchParams.set("parent_imdb_id", params.parentImdbId.replace(IMDB_PREFIX_REGEX, ""));
	}
	if (params.query) {
		searchParams.set("query", params.query);
	}
	if (params.year) {
		searchParams.set("year", String(params.year));
	}
	if (typeof params.seasonNumber === "number" && Number.isFinite(params.seasonNumber)) {
		searchParams.set("season_number", String(params.seasonNumber));
	}
	if (typeof params.episodeNumber === "number" && Number.isFinite(params.episodeNumber)) {
		searchParams.set("episode_number", String(params.episodeNumber));
	}
	if (params.languages) {
		searchParams.set("languages", params.languages);
	}

	// Sort by download count to get best results first
	searchParams.set("order_by", "download_count");
	searchParams.set("order_direction", "desc");

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
		const [file] = attr.files;

		return {
			aiTranslated: attr.ai_translated,
			downloadCount: attr.download_count,
			fileId: file?.file_id ?? 0,
			fileName: file?.file_name ?? "unknown",
			fps: attr.fps,
			fromTrusted: attr.from_trusted,
			hearingImpaired: attr.hearing_impaired,
			id: item.id,
			language: attr.language,
			languageName: getLanguageName(attr.language),
			ratings: attr.ratings,
			release: attr.release,
		};
	});
}

// ============================================================================
// Download
// ============================================================================

export async function downloadSubtitle(
	fileId: number,
	media: Pick<Media, "id" | "type" | "title" | "year" | "filePath" | "parentId" | "seasonNumber" | "episodeNumber">,
	language: string
): Promise<{ filePath: string }> {
	let libraryDir: string;
	if (media.filePath) {
		libraryDir = path.dirname(media.filePath);
	} else if (media.type === "episode") {
		const show = media.parentId ? mediaDb.getById(media.parentId) : undefined;
		if (!show) {
			throw new Error("Episode's show not found");
		}
		libraryDir = getSeasonLibraryDirectory(show, media.seasonNumber);
	} else {
		libraryDir = getMovieLibraryRoot(media);
	}

	const apiKey = await getApiKey();
	if (!apiKey) {
		throw new Error("OpenSubtitles API key not configured");
	}

	const token = await getValidToken(apiKey);

	const response = await fetch(`${BASE_URL}/download`, {
		body: JSON.stringify({ file_id: fileId }),
		headers: buildHeaders(apiKey, token ?? undefined),
		method: "POST",
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
	const subtitleDir = path.join(libraryDir, "subtitles");
	await fs.mkdir(subtitleDir, { recursive: true });

	const episodePrefix = media.type === "episode" ? `E${String(media.episodeNumber ?? 0).padStart(2, "0")}_` : "";
	const safeName = `${episodePrefix}${sanitizeFilename(getLanguageName(language))}_${nanoid()}`;
	const fileName = `${safeName}.srt`;
	const filePath = path.join(subtitleDir, fileName);

	await fs.writeFile(filePath, content, "utf-8");

	// Step 4: Convert to VTT if needed (SRT is most common from OpenSubtitles)
	const { convertSubtitleToVtt } = await import("./ffmpeg");
	const vttFileName = `${safeName}.vtt`;
	const vttPath = path.join(subtitleDir, vttFileName);

	try {
		await convertSubtitleToVtt(filePath, vttPath);
		// Clean up the original SRT
		await fs.unlink(filePath).catch(() => undefined);
		return { filePath: vttPath };
	} catch {
		// If conversion fails, try serving the SRT directly
		console.error("[OpenSubtitles] VTT conversion failed, keeping SRT");
		return { filePath };
	}
}
