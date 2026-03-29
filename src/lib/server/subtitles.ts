import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '$lib/config';
import { subtitlesDb } from './db';

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

function parseLanguageFromFilename(fileName: string): { language: string; label: string } {
	const nameWithoutExt = fileName.slice(0, fileName.lastIndexOf('.'));
	const parts = nameWithoutExt.split('.');
	const lastPart = parts.at(-1)?.toLowerCase() ?? '';
	if (LANGUAGE_MAP[lastPart]) {
		return { language: lastPart, label: LANGUAGE_MAP[lastPart] };
	}
	for (const [code, name] of Object.entries(LANGUAGE_MAP)) {
		if (lastPart === name.toLowerCase()) {
			return { language: code, label: name };
		}
	}
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
	return SIDECAR_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

export async function discoverSidecarSubtitles(mediaId: string, libraryDir: string): Promise<void> {
	let files: string[];
	try {
		files = await fs.readdir(libraryDir);
	} catch {
		return;
	}
	const subtitleFiles = files.filter((fileName) => isSubtitleFile(fileName));
	if (subtitleFiles.length === 0) {
		return;
	}
	const existingPaths = new Set(subtitlesDb.getByMediaId(mediaId).map((subtitle) => subtitle.filePath));
	await fs.mkdir(getSubtitleDir(mediaId), { recursive: true });
	for (const fileName of subtitleFiles) {
		const sourcePath = path.join(libraryDir, fileName);
		if (existingPaths.has(sourcePath)) {
			continue;
		}
		if (path.extname(fileName).toLowerCase() !== '.vtt') {
			continue;
		}
		const { language, label } = parseLanguageFromFilename(fileName);
		subtitlesDb.create({
			mediaId,
			language,
			label,
			source: 'sidecar',
			format: 'vtt',
			filePath: sourcePath,
			streamIndex: null,
			isDefault: false,
			isForced: false,
		});
	}
}

export async function discoverSubtitles(mediaId: string, _videoFilePath: string, libraryDir: string): Promise<void> {
	await discoverSidecarSubtitles(mediaId, libraryDir);
}

export function getSubtitleTracks(mediaId: string) {
	return subtitlesDb.getByMediaId(mediaId).map((subtitle) => ({
		id: subtitle.id,
		mediaId: subtitle.mediaId,
		language: subtitle.language,
		label: subtitle.label,
		source: subtitle.source,
		isDefault: subtitle.isDefault,
		isForced: subtitle.isForced,
		src: `/api/media/${mediaId}/subtitles/${subtitle.id}`,
	}));
}
