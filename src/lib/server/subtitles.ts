import fs from "node:fs/promises";
import path from "node:path";
import type { Media } from "$lib/server/db/schema";
import type { SubtitleTrackResponse } from "$lib/types";
import { subtitlesDb } from "./db";

const SIDECAR_EXTENSIONS = [".srt", ".ass", ".ssa", ".vtt", ".sub"];

const LANGUAGE_MAP: Record<string, string> = {
	ara: "Arabic",
	chi: "Chinese",
	dan: "Danish",
	deu: "German",
	dut: "Dutch",
	eng: "English",
	fin: "Finnish",
	fra: "French",
	fre: "French",
	ger: "German",
	hin: "Hindi",
	ita: "Italian",
	jpn: "Japanese",
	kor: "Korean",
	nld: "Dutch",
	nor: "Norwegian",
	pol: "Polish",
	por: "Portuguese",
	rus: "Russian",
	spa: "Spanish",
	swe: "Swedish",
	tur: "Turkish",
	und: "Unknown",
	zho: "Chinese",
};

function parseLanguageFromFilename(fileName: string): { language: string; label: string } {
	const nameWithoutExt = fileName.slice(0, fileName.lastIndexOf("."));
	const parts = nameWithoutExt.split(".");
	const lastPart = parts.at(-1)?.toLowerCase() ?? "";
	if (LANGUAGE_MAP[lastPart]) {
		return { label: LANGUAGE_MAP[lastPart], language: lastPart };
	}
	for (const [code, name] of Object.entries(LANGUAGE_MAP)) {
		if (lastPart === name.toLowerCase()) {
			return { label: name, language: code };
		}
	}
	if (parts.length >= 2) {
		const secondLast = parts.at(-2)?.toLowerCase() ?? "";
		for (const [code, name] of Object.entries(LANGUAGE_MAP)) {
			if (secondLast === code || secondLast === name.toLowerCase()) {
				return { label: name, language: code };
			}
		}
	}
	return { label: "Unknown", language: "und" };
}

function isSubtitleFile(fileName: string): boolean {
	return SIDECAR_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

async function discoverSidecarSubtitles(mediaId: string, libraryDir: string): Promise<void> {
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
	for (const fileName of subtitleFiles) {
		const sourcePath = path.join(libraryDir, fileName);
		if (existingPaths.has(sourcePath)) {
			continue;
		}
		if (path.extname(fileName).toLowerCase() !== ".vtt") {
			continue;
		}
		const { language, label } = parseLanguageFromFilename(fileName);
		subtitlesDb.create({
			filePath: sourcePath,
			label,
			language,
			mediaId,
			source: "sidecar",
		});
	}
}

export async function discoverSubtitles(mediaId: string, libraryDir: string): Promise<void> {
	await discoverSidecarSubtitles(mediaId, libraryDir);
}

function getSubtitleTracks(mediaId: string): SubtitleTrackResponse[] {
	return subtitlesDb.getByMediaId(mediaId).map((subtitle) => ({
		id: subtitle.id,
		label: subtitle.label,
		language: subtitle.language,
		mediaId: subtitle.mediaId,
		source: subtitle.source,
		src: `/api/media/${mediaId}/subtitles/${subtitle.id}`,
	}));
}
export async function getSubtitleTracksForMedia(
	media: Pick<Media, "id" | "filePath">
): Promise<SubtitleTrackResponse[]> {
	if (media.filePath) {
		await discoverSubtitles(media.id, path.dirname(media.filePath));
	}
	return getSubtitleTracks(media.id);
}
