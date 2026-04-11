import fs from 'node:fs/promises';
import path from 'node:path';
import { subtitlesDb } from './db';
import { getCanonicalStoragePath, getStoredFileName, isAbsoluteStoragePath, normalizeStorageKey } from './storage';
import { getStorageAdapter } from './storage/factory';

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

function isSubtitleFile(fileName: string): boolean {
	return SIDECAR_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

async function listSubtitleCandidates(
	libraryDir: string,
	organizationId?: string | null
): Promise<Array<{ key: string; fileName: string }>> {
	if (isAbsoluteStoragePath(libraryDir)) {
		const files = await fs.readdir(libraryDir).catch(() => []);
		return files
			.filter((fileName) => isSubtitleFile(fileName))
			.map((fileName) => ({
				key: path.join(libraryDir, fileName),
				fileName,
			}));
	}

	const adapter = await getStorageAdapter(organizationId);
	const prefix = normalizeStorageKey(libraryDir);
	const files = await adapter.list(prefix);
	return files
		.filter((file) => isSubtitleFile(file.key) && path.posix.dirname(file.key) === prefix)
		.map((file) => ({
			key: file.key,
			fileName: getStoredFileName(file.key),
		}));
}

export async function discoverSidecarSubtitles(
	mediaId: string,
	organizationId: string | null | undefined,
	libraryDir: string
): Promise<void> {
	const subtitleFiles = await listSubtitleCandidates(libraryDir, organizationId);
	if (subtitleFiles.length === 0) {
		return;
	}
	const existingPaths = new Set(
		subtitlesDb
			.getByMediaId(mediaId)
			.map((subtitle) => (subtitle.filePath ? getCanonicalStoragePath(subtitle.filePath) : null))
			.filter((value): value is string => Boolean(value))
	);
	for (const subtitleFile of subtitleFiles) {
		if (existingPaths.has(getCanonicalStoragePath(subtitleFile.key))) {
			continue;
		}
		if (path.extname(subtitleFile.fileName).toLowerCase() !== '.vtt') {
			continue;
		}
		const { language, label } = parseLanguageFromFilename(subtitleFile.fileName);
		subtitlesDb.create({
			mediaId,
			language,
			label,
			source: 'sidecar',
			format: 'vtt',
			filePath: subtitleFile.key,
			streamIndex: null,
			isDefault: false,
			isForced: false,
		});
	}
}

export async function discoverSubtitles(
	mediaId: string,
	organizationId: string | null | undefined,
	_videoFilePath: string,
	libraryDir: string
): Promise<void> {
	await discoverSidecarSubtitles(mediaId, organizationId, libraryDir);
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
