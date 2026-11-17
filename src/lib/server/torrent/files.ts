import path from "node:path";
import ptt from "parse-torrent-title";
import { isSupportedFormat } from "../ffmpeg";
import type { TorrentFile } from "./client";

const SUBTITLE_EXTENSIONS = [".srt", ".ass", ".ssa", ".vtt", ".sub"];

// Minimum file size to consider as main video (50MB)
export const MIN_VIDEO_SIZE = 50 * 1024 * 1024;

// Regex patterns at top level for performance
const INFOHASH_REGEX = /urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i;
const DISPLAY_NAME_REGEX = /[?&]dn=([^&]+)/i;

// Regex patterns for episode parsing
const SXXEXX_PATTERN = /S(\d{1,2})E(\d{1,2})/i;
const NXNN_PATTERN = /(\d{1,2})x(\d{1,2})/i;

// Extract infohash from magnet link using regex (more reliable than parse-torrent for magnets)
function extractInfohash(magnetLink: string): string {
	// Match btih (BitTorrent Info Hash) in magnet link
	const match = magnetLink.match(INFOHASH_REGEX);
	if (match) {
		const hash = match[1];
		// Convert base32 to hex if necessary
		if (hash.length === 32) {
			const hex = base32ToHex(hash).toLowerCase();
			// console.log(`[Magnet] Converted base32 hash ${hash} to ${hex}`);
			return hex;
		}
		return hash.toLowerCase();
	}

	return "";
}

// Extract display name from magnet link
function extractDisplayName(magnetLink: string): string {
	const match = magnetLink.match(DISPLAY_NAME_REGEX);
	if (match) {
		return decodeURIComponent(match[1].replace(/\+/g, " "));
	}
	return "";
}

// Convert base32 to hex
function base32ToHex(base32: string): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const char of base32.toUpperCase()) {
		const val = alphabet.indexOf(char);
		if (val === -1) {
			continue;
		}
		bits += val.toString(2).padStart(5, "0");
	}
	let hex = "";
	for (let i = 0; i < bits.length; i += 4) {
		hex += Number.parseInt(bits.substr(i, 4), 2).toString(16);
	}
	return hex;
}

export function parseMagnet(magnetLink: string) {
	const infohash = extractInfohash(magnetLink);
	const name = extractDisplayName(magnetLink);

	// Parse title from magnet name
	const titleInfo = ptt.parse(name);

	return {
		infohash,
		name,
		title: titleInfo.title || "",
		year: titleInfo.year,
	};
}

export function getMimeType(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase();
	const mimeTypes: Record<string, string> = {
		".mp4": "video/mp4",
		".mkv": "video/x-matroska",
		".webm": "video/webm",
		".avi": "video/x-msvideo",
		".mov": "video/quicktime",
		".m4v": "video/x-m4v",
	};
	return mimeTypes[ext] || "application/octet-stream";
}

export function findVideoFile(files: TorrentFile[]): TorrentFile | null {
	// Filter to supported video files that meet minimum size requirement
	const videoFiles = files
		.filter((f) => isSupportedFormat(f.name) && f.length >= MIN_VIDEO_SIZE)
		.sort((a, b) => b.length - a.length);

	if (videoFiles.length > 0) {
		return videoFiles[0];
	}

	// Fallback: get any supported video file regardless of size
	const anyVideo = files.filter((f) => isSupportedFormat(f.name)).sort((a, b) => b.length - a.length)[0];

	return anyVideo || null;
}

export function findVideoFiles(files: TorrentFile[]): TorrentFile[] {
	// Filter to supported video files that meet minimum size requirement
	const videoFiles = files
		.filter((f) => isSupportedFormat(f.name) && f.length >= MIN_VIDEO_SIZE)
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

	if (videoFiles.length > 0) {
		return videoFiles;
	}

	// Fallback: get any supported video files regardless of size
	return files
		.filter((f) => isSupportedFormat(f.name))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function findSubtitleFiles(files: TorrentFile[]): TorrentFile[] {
	return files.filter((f) => {
		const ext = path.extname(f.name).toLowerCase();
		return SUBTITLE_EXTENSIONS.includes(ext);
	});
}

/**
 * Map video files to episodes using filename parsing
 */
export function mapFilesToEpisodes(files: TorrentFile[], defaultSeason?: number): Map<number, number> {
	const mapping = new Map<number, number>();

	for (const [index, file] of files.entries()) {
		const parsed = ptt.parse(file.name);

		if (parsed.season !== undefined && parsed.episode !== undefined) {
			// Standard S01E01 format
			const episodeKey = parsed.season * 100 + parsed.episode;
			mapping.set(episodeKey, index);
		} else if (parsed.episode !== undefined) {
			// Episode only (assume default season or season 1)
			const season = defaultSeason ?? 1;
			const episodeKey = season * 100 + parsed.episode;
			mapping.set(episodeKey, index);
		} else {
			// Try regex patterns directly on filename
			const sxxexx = file.name.match(SXXEXX_PATTERN);
			if (sxxexx) {
				const season = Number.parseInt(sxxexx[1], 10);
				const episode = Number.parseInt(sxxexx[2], 10);
				const episodeKey = season * 100 + episode;
				mapping.set(episodeKey, index);
				continue;
			}

			const nxnn = file.name.match(NXNN_PATTERN);
			if (nxnn) {
				const season = Number.parseInt(nxnn[1], 10);
				const episode = Number.parseInt(nxnn[2], 10);
				const episodeKey = season * 100 + episode;
				mapping.set(episodeKey, index);
			}
		}
	}

	return mapping;
}

/**
 * Auto-number files sequentially when mapping fails
 */
export function autoNumberFiles(files: TorrentFile[], defaultSeason?: number): Map<number, number> {
	const mapping = new Map<number, number>();

	// Sort files by name to maintain order
	const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

	const season = defaultSeason ?? 1;
	for (const [index, file] of sortedFiles.entries()) {
		// Assume default season, episode = index + 1
		const episodeKey = season * 100 + (index + 1);
		mapping.set(episodeKey, files.indexOf(file));
	}

	return mapping;
}
