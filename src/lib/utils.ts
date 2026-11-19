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

// Same rule as mediaDb.getRecentlyWatched: playback is done at 95% of the duration.
const WATCHED_RATIO = 0.95;

export function hasUnfinishedPlayback(media: Pick<Media, "playPosition" | "playDuration">): boolean {
	const position = media.playPosition ?? 0;
	if (position <= 0) {
		return false;
	}
	return media.playDuration === null || position < media.playDuration * WATCHED_RATIO;
}

export interface PlayTarget {
	episode: Media;
	mode: "resume" | "play" | "restart" | "waiting";
}

/** Picks what the show Play button starts. The episodes must be in watch order. */
export function getPlayTarget(episodes: Media[]): PlayTarget | null {
	const lastPlayedTimes = episodes.map((episode) => episode.lastPlayedAt?.getTime() ?? 0);
	const lastPlayedTime = Math.max(0, ...lastPlayedTimes);
	const lastIndex = lastPlayedTime > 0 ? lastPlayedTimes.indexOf(lastPlayedTime) : -1;
	const last = episodes[lastIndex];
	const lastDone = !last || ((last.playPosition ?? 0) > 0 && !hasUnfinishedPlayback(last));
	const remaining = episodes.slice(lastDone ? lastIndex + 1 : lastIndex);
	const next = remaining.find(canPlayEpisode);
	if (next) {
		return { episode: next, mode: hasUnfinishedPlayback(next) ? "resume" : "play" };
	}
	// The next episode is not ready yet, so the button shows its status.
	if (remaining.length > 0) {
		return { episode: remaining[0], mode: "waiting" };
	}
	const first = episodes.find(canPlayEpisode);
	return first ? { episode: first, mode: "restart" } : null;
}

export function isTerminalProgressStatus(status: string | null | undefined): boolean {
	return status === "complete" || status === "error" || status === "not_found" || status === "removed";
}

/** Fail loudly on a broken invariant. Never use this for input the user controls. */
export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`assertion failed: ${message}`);
	}
}

/** One upload chunk. It equals the SvelteKit default BODY_SIZE_LIMIT of 512K, which lets a body of exactly that size through. */
export const UPLOAD_CHUNK_BYTES = 512 * 1024;

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const SIZE_DECIMALS = [0, 1, 1, 2, 2] as const;

/** Format a byte count for display. The count must be finite and not negative. */
export function formatFileSize(bytes: number): string {
	assert(Number.isFinite(bytes), `formatFileSize: bytes must be finite, got ${bytes}`);
	assert(bytes >= 0, `formatFileSize: bytes must not be negative, got ${bytes}`);

	let value = bytes;
	let unit = 0;
	while (value >= BYTES_PER_UNIT && unit < SIZE_UNITS.length - 1) {
		value /= BYTES_PER_UNIT;
		unit += 1;
	}

	return `${value.toFixed(SIZE_DECIMALS[unit])} ${SIZE_UNITS[unit]}`;
}
