/** The highest age rating a profile shows. Each level allows its own US ratings and every level below it. */

import { assert } from "$lib/utils";

export const RATING_LIMITS = [
	{ value: "G", label: "G: all ages", ratings: ["G", "TV-Y", "TV-G"] },
	{ value: "PG", label: "PG: older kids", ratings: ["PG", "TV-Y7", "TV-Y7-FV", "TV-PG"] },
	{ value: "PG-13", label: "PG-13: teens", ratings: ["PG-13", "TV-14"] },
	{ value: "R", label: "R: adults", ratings: ["R", "TV-MA"] },
] as const;

export type RatingLimit = (typeof RATING_LIMITS)[number]["value"];

/** Narrow a stored value. Any other value means no limit. */
export function toRatingLimit(value: unknown): RatingLimit | null {
	return RATING_LIMITS.find((limit) => limit.value === value)?.value ?? null;
}

/** A missing or other rating (NR, NC-17) is never in the list, so a limit always hides it. */
export function allowedRatings(limit: RatingLimit): string[] {
	const index = RATING_LIMITS.findIndex((entry) => entry.value === limit);
	assert(index >= 0, `allowedRatings: unknown limit ${limit}`);
	return RATING_LIMITS.slice(0, index + 1).flatMap((entry) => [...entry.ratings]);
}
