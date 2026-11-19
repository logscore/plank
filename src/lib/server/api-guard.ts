import { error } from "@sveltejs/kit";
import { allowedRatings } from "$lib/rating-limit";
import { mediaDb } from "$lib/server/db";
import type { Media } from "$lib/server/db/schema";
import { getRatingLimit, isRatingAllowed } from "$lib/server/rating-limit";

/** Also resolves the member's rating limit once, so every caller can apply it. */
export function requireOrganizationAccess(locals: App.Locals) {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw error(403, "Active profile required");
	}
	const limit = getRatingLimit(locals.user.id, organizationId);
	return { userId: locals.user.id, organizationId, allowedRatings: limit === null ? null : allowedRatings(limit) };
}

/** An episode takes the rating of its show. */
export function isMediaAllowed(mediaItem: Media, organizationId: string, allowed: readonly string[]): boolean {
	const rated =
		mediaItem.type === "episode" && mediaItem.parentId
			? mediaDb.get(mediaItem.parentId, organizationId)
			: mediaItem;
	return isRatingAllowed(rated?.certification ?? null, allowed);
}

export function requireMediaAccess(locals: App.Locals, mediaId: string) {
	const { organizationId, userId, allowedRatings } = requireOrganizationAccess(locals);
	const mediaItem = mediaDb.get(mediaId, organizationId);
	if (!mediaItem) {
		throw error(404, "Media not found");
	}
	if (allowedRatings && !isMediaAllowed(mediaItem, organizationId, allowedRatings)) {
		throw error(404, "Media not found");
	}

	return { userId, organizationId, mediaItem, allowedRatings };
}
