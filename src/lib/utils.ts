import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Media } from "$lib/types";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function canPlayEpisode(episode: Pick<Media, "filePath" | "fileIndex" | "status">): boolean {
	return Boolean(
		episode.filePath ||
			episode.fileIndex !== null ||
			episode.status === "complete" ||
			episode.status === "downloading"
	);
}

export function isTerminalProgressStatus(status: string | null | undefined): boolean {
	return status === "complete" || status === "error" || status === "not_found" || status === "removed";
}
