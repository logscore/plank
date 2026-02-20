import { redirect } from '@sveltejs/kit';
import type { Invitation } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { mediaDb } from '$lib/server/db';
import { db } from '$lib/server/db/index';
import { schema } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Use active organization from session
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw redirect(302, '/profiles');
	}

	// Fetch the organization directly
	const organization = db.select().from(schema.organization).where(eq(schema.organization.id, organizationId)).get();

	if (!organization) {
		throw redirect(302, '/profiles');
	}

	// Get Members (via Better Auth API)
	const membersResult = await auth.api.listMembers({
		headers: request.headers,
		query: {
			organizationId,
		},
	});
	const membersList = membersResult.members || [];

	// Determine role from members list
	const currentMember = membersList.find((m) => m.userId === locals.user?.id);
	const userRole = currentMember?.role || 'member';

	let invitations: Invitation[] = [];

	try {
		if (userRole === 'owner' || userRole === 'admin') {
			const invitationsResult = await auth.api.listInvitations({
				headers: request.headers,
				query: {
					organizationId,
				},
			});
			invitations = invitationsResult.filter((i) => i.status === 'pending');
		}
	} catch (e) {
		console.error('Failed to list invitations:', e);
	}

	// Use mediaDb with organization context
	const userMedia = mediaDb.list(organizationId);

	// Calculate total storage used
	const totalSize = userMedia.reduce((acc, item) => acc + (item.fileSize || 0), 0);

	// Count media by status
	const mediaStats = {
		total: userMedia.length,
		complete: userMedia.filter((m) => m.status === 'complete').length,
		downloading: userMedia.filter((m) => m.status === 'downloading' || m.status === 'added').length,
		error: userMedia.filter((m) => m.status === 'error').length,
	};

	return {
		user: locals.user,
		userRole,
		organization,
		members: membersList,
		invitations,
		stats: {
			...mediaStats,
			totalSize,
		},
	};
};
