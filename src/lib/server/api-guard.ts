import { error } from "@sveltejs/kit";
import { mediaDb } from "$lib/server/db";

export function requireAuth(locals: App.Locals) {
	if (!locals.user) {
		throw error(401, "Unauthorized");
	}
	if (!locals.session?.activeOrganizationId) {
		throw error(403, "Active profile required");
	}

	return {
		userId: locals.user.id,
		organizationId: locals.session.activeOrganizationId,
	};
}

export function requireMediaAccess(locals: App.Locals, mediaId: string) {
	const context = requireAuth(locals);
	const mediaItem = mediaDb.get(mediaId, context.organizationId);
	if (!mediaItem) {
		throw error(404, "Media not found");
	}

	return {
		...context,
		mediaItem,
	};
}
