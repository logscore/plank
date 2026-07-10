import { error } from "@sveltejs/kit";
import { mediaDb } from "$lib/server/db";

export function requireMediaAccess(locals: App.Locals, mediaId: string) {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw error(403, "Active profile required");
	}

	const mediaItem = mediaDb.get(mediaId, organizationId);
	if (!mediaItem) {
		throw error(404, "Media not found");
	}

	return { userId: locals.user.id, organizationId, mediaItem };
}
