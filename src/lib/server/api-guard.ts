import { error } from '@sveltejs/kit';
import { mediaDb } from '$lib/server/db';
import type { Media } from '$lib/server/db/schema';

export function requireAuth(locals: App.Locals): { userId: string; organizationId: string } {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}
	return { userId: locals.user.id, organizationId };
}

//
export function requireMediaAccess(
	locals: App.Locals,
	mediaId: string
): { userId: string; organizationId: string; mediaItem: Media } {
	const auth = requireAuth(locals);
	const mediaItem = mediaDb.get(mediaId, auth.organizationId);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}
	return { ...auth, mediaItem };
}
