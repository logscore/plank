/** Per-member age rating limits. An owner or admin sets them on the Members settings page. */

import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { type RatingLimit, toRatingLimit } from "$lib/rating-limit";
import { db } from "$lib/server/db/index";
import { member } from "$lib/server/db/schema";
import type { AddMediaFromMagnetParams } from "$lib/server/media-library";
import { findBestTorrent } from "$lib/server/prowlarr";
import { type BrowseItem, getBrowseItemDetails } from "$lib/server/tmdb";
import { getCachedTorrent } from "$lib/server/torrent-cache";
import { assert } from "$lib/utils";

export function getRatingLimit(userId: string, organizationId: string): RatingLimit | null {
	assert(userId.length > 0, "getRatingLimit: userId is empty");
	assert(organizationId.length > 0, "getRatingLimit: organizationId is empty");
	const row = db
		.select({ maxRating: member.maxRating })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
		.get();
	return toRatingLimit(row?.maxRating);
}

/** Every member's limit in one profile, by member id. */
export function listRatingLimits(organizationId: string): Record<string, RatingLimit | null> {
	assert(organizationId.length > 0, "listRatingLimits: organizationId is empty");
	const rows = db
		.select({ id: member.id, maxRating: member.maxRating })
		.from(member)
		.where(eq(member.organizationId, organizationId))
		.all();
	return Object.fromEntries(rows.map((row) => [row.id, toRatingLimit(row.maxRating)]));
}

/** The same rule as removing a member: owners manage everyone else, admins manage members. */
export function setMemberRatingLimit(
	callerUserId: string,
	organizationId: string,
	memberId: string,
	limit: RatingLimit | null
): void {
	const caller = db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, callerUserId), eq(member.organizationId, organizationId)))
		.get();
	const target = db
		.select({ userId: member.userId, role: member.role })
		.from(member)
		.where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
		.get();
	if (!target) {
		error(404, "Member not found");
	}
	if (!caller || target.userId === callerUserId) {
		error(403, "You cannot change the rating limit of this member");
	}
	const canManage = caller.role === "owner" || (caller.role === "admin" && target.role === "member");
	if (!canManage) {
		error(403, "You cannot change the rating limit of this member");
	}
	db.update(member).set({ maxRating: limit }).where(eq(member.id, memberId)).run();
	assert(getRatingLimit(target.userId, organizationId) === limit, "setMemberRatingLimit: the limit must be stored");
}

export function isRatingAllowed(certification: string | null, allowed: readonly string[]): boolean {
	return certification !== null && allowed.includes(certification);
}

/** Keep the TMDB results with an allowed rating. A failed lookup hides the title. */
export async function filterAllowedTitles(items: BrowseItem[], allowed: readonly string[]): Promise<BrowseItem[]> {
	// shortcut: one cached TMDB details call per title, upgrade to discover certification params if TMDB rate limits hit.
	const details = await Promise.allSettled(items.map((item) => getBrowseItemDetails(item.tmdbId, item.mediaType)));
	assert(details.length === items.length, "filterAllowedTitles: one lookup per item");
	const kept: BrowseItem[] = [];
	for (const [index, result] of details.entries()) {
		if (result.status === "fulfilled" && isRatingAllowed(result.value.certification, allowed)) {
			kept.push({ ...items[index], certification: result.value.certification });
		}
	}
	return kept;
}

/** Reject an add unless TMDB gives the title an allowed rating. The rating from the client is not trusted. */
export async function requireAllowedTitle(
	tmdbId: unknown,
	type: "movie" | "show",
	allowed: readonly string[]
): Promise<{ tmdbId: number; imdbId: string | null }> {
	if (typeof tmdbId !== "number" || !Number.isInteger(tmdbId) || tmdbId <= 0) {
		error(403, "Your rating limit allows only titles from Browse or Search");
	}
	const details = await getBrowseItemDetails(tmdbId, type).catch(() => null);
	if (!(details && isRatingAllowed(details.certification, allowed))) {
		error(403, "Your rating limit blocks this title");
	}
	return { tmdbId, imdbId: details.imdbId };
}

/** A limited member never picks the torrent or the metadata. The server takes both from the checked TMDB id. */
export async function allowedMovieParams(
	tmdbId: unknown,
	allowed: readonly string[]
): Promise<AddMediaFromMagnetParams> {
	const checked = await requireAllowedTitle(tmdbId, "movie", allowed);
	if (!checked.imdbId) {
		error(404, "No torrent found for this title");
	}
	const cached = await getCachedTorrent(checked.imdbId);
	const magnetLink = cached?.magnetLink ?? (await findBestTorrent(checked.imdbId, { mediaType: "movie" }))?.magnetUri;
	if (!magnetLink) {
		error(404, "No torrent found for this title");
	}
	return { magnetLink, tmdbId: checked.tmdbId, type: "movie" };
}
