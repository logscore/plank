import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '$lib/config';
import { subtitlesDb } from './db';
import { convertSubtitleToVtt, extractSubtitleAsVtt, probeSubtitleStreams } from './ffmpeg';

const SIDECAR_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt', '.sub'];

const LANGUAGE_MAP: Record<string, string> = {
	eng: 'English',
	spa: 'Spanish',
	fre: 'French',
	fra: 'French',
	ger: 'German',
	deu: 'German',
	ita: 'Italian',
	por: 'Portuguese',
	jpn: 'Japanese',
	kor: 'Korean',
	chi: 'Chinese',
	zho: 'Chinese',
	ara: 'Arabic',
	rus: 'Russian',
	hin: 'Hindi',
	pol: 'Polish',
	tur: 'Turkish',
	nld: 'Dutch',
	dut: 'Dutch',
	swe: 'Swedish',
	nor: 'Norwegian',
	dan: 'Danish',
	fin: 'Finnish',
	und: 'Unknown',
};

function getLanguageLabel(langCode: string, title: string): string {
	if (title && !title.startsWith('Track ')) {
		return title;
	}
	return LANGUAGE_MAP[langCode] ?? langCode.toUpperCase();
}

/** Parse language from a sidecar subtitle filename like "Movie.English.srt" or "Movie.eng.srt" */
function parseLanguageFromFilename(fileName: string): { language: string; label: string } {
	const nameWithoutExt = fileName.slice(0, fileName.lastIndexOf('.'));
	const parts = nameWithoutExt.split('.');
	const lastPart = parts.at(-1)?.toLowerCase() ?? '';

	// Check if last part is a known language code
	if (LANGUAGE_MAP[lastPart]) {
		return { language: lastPart, label: LANGUAGE_MAP[lastPart] };
	}

	// Check if last part is a full language name
	for (const [code, name] of Object.entries(LANGUAGE_MAP)) {
		if (lastPart === name.toLowerCase()) {
			return { language: code, label: name };
		}
	}

	// Also check second-to-last part for patterns like "Movie.2_English.srt"
	if (parts.length >= 2) {
		const secondLast = parts.at(-2)?.toLowerCase() ?? '';
		for (const [code, name] of Object.entries(LANGUAGE_MAP)) {
			if (secondLast === code || secondLast === name.toLowerCase()) {
				return { language: code, label: name };
			}
		}
	}

	return { language: 'und', label: 'Unknown' };
}

function getSubtitleDir(mediaId: string): string {
	return path.join(config.paths.library, mediaId, 'subtitles');
}

function isSubtitleFile(fileName: string): boolean {
	const ext = path.extname(fileName).toLowerCase();
	return SIDECAR_EXTENSIONS.includes(ext);
}

/**
 * Tier 1: Discover sidecar subtitle files (.srt, .ass, .vtt) alongside video files in the library directory.
 */
export async function discoverSidecarSubtitles(mediaId: string, libraryDir: string, episodeId?: string): Promise<void> {
	let files: string[];
	try {
		files = await fs.readdir(libraryDir);
	} catch {
		return;
	}

	const subtitleFiles = files.filter((f) => isSubtitleFile(f));
	if (subtitleFiles.length === 0) {
		return;
	}

	// Check what's already been discovered
	const existing = episodeId ? subtitlesDb.getByEpisodeId(episodeId) : subtitlesDb.getByMediaId(mediaId);
	const existingPaths = new Set(existing.map((s) => s.filePath));

	const subtitleDir = getSubtitleDir(mediaId);
	await fs.mkdir(subtitleDir, { recursive: true });

	for (const fileName of subtitleFiles) {
		const sourcePath = path.join(libraryDir, fileName);

		// Skip if already processed
		if (existingPaths.has(sourcePath)) {
			continue;
		}

		const ext = path.extname(fileName).toLowerCase();
		const { language, label } = parseLanguageFromFilename(fileName);

		let vttPath: string;
		if (ext === '.vtt') {
			// Already VTT, use directly
			vttPath = sourcePath;
		} else {
			// Convert to VTT
			const baseName = path.basename(fileName, ext);
			vttPath = path.join(subtitleDir, `${baseName}.vtt`);
			try {
				await convertSubtitleToVtt(sourcePath, vttPath);
			} catch (err) {
				console.error(`[Subtitles] Failed to convert ${fileName}:`, err);
				continue;
			}
		}

		subtitlesDb.create({
			mediaId,
			episodeId: episodeId ?? null,
			language,
			label,
			source: 'sidecar',
			format: 'vtt',
			filePath: vttPath,
			streamIndex: null,
			isDefault: false,
			isForced: false,
		});
	}
}

/**
 * Tier 2: Discover embedded subtitle streams inside a video file via FFmpeg.
 */
export async function discoverEmbeddedSubtitles(mediaId: string, filePath: string, episodeId?: string): Promise<void> {
	const streams = await probeSubtitleStreams(filePath);
	if (streams.length === 0) {
		return;
	}

	const subtitleDir = getSubtitleDir(mediaId);
	await fs.mkdir(subtitleDir, { recursive: true });

	// Check which streams are already extracted
	const existing = episodeId ? subtitlesDb.getByEpisodeId(episodeId) : subtitlesDb.getByMediaId(mediaId);
	const existingIndices = new Set(existing.filter((s) => s.source === 'embedded').map((s) => s.streamIndex));

	for (const stream of streams) {
		if (existingIndices.has(stream.index)) {
			continue;
		}

		const suffix = episodeId ? `${episodeId}_${stream.index}` : `${mediaId}_${stream.index}`;
		const vttPath = path.join(subtitleDir, `${suffix}.vtt`);

		try {
			await extractSubtitleAsVtt(filePath, stream.index, vttPath);
		} catch (err) {
			console.error(`[Subtitles] Failed to extract stream ${stream.index} from ${filePath}:`, err);
			continue;
		}

		const label = getLanguageLabel(stream.language, stream.title);

		subtitlesDb.create({
			mediaId,
			episodeId: episodeId ?? null,
			language: stream.language,
			label,
			source: 'embedded',
			format: 'vtt',
			filePath: vttPath,
			streamIndex: stream.index,
			isDefault: stream.isDefault,
			isForced: stream.isForced,
		});
	}
}

/**
 * Orchestrator: runs Tier 1 (sidecar) then Tier 2 (embedded) subtitle discovery.
 */
export async function discoverSubtitles(
	mediaId: string,
	videoFilePath: string,
	libraryDir: string,
	episodeId?: string
): Promise<void> {
	await discoverSidecarSubtitles(mediaId, libraryDir, episodeId);
	await discoverEmbeddedSubtitles(mediaId, videoFilePath, episodeId);
}

/**
 * Get subtitle tracks for a media item or episode, formatted for client consumption.
 */
export function getSubtitleTracks(mediaId: string, episodeId?: string) {
	const subs = episodeId ? subtitlesDb.getByEpisodeId(episodeId) : subtitlesDb.getByMediaId(mediaId);

	return subs.map((sub) => ({
		id: sub.id,
		mediaId: sub.mediaId,
		episodeId: sub.episodeId,
		language: sub.language,
		label: sub.label,
		source: sub.source,
		isDefault: sub.isDefault,
		isForced: sub.isForced,
		src: `/api/media/${mediaId}/subtitles/${sub.id}`,
	}));
}
