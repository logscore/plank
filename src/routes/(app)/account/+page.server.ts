import { redirect } from "@sveltejs/kit";
import type { Invitation } from "better-auth/plugins";
import { auth } from "$lib/server/auth";
import { mediaDb } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, request }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw redirect(302, "/profiles");
	}

	const organization = await auth.api
		.getFullOrganization({
			headers: request.headers,
			query: { organizationId },
		})
		.catch(() => null);

	if (!organization) {
		throw redirect(302, "/profiles");
	}

	const membersList = organization.members || [];

	// Determine role from members list
	const currentMember = membersList.find((m) => m.userId === locals.user.id);
	const userRole = currentMember?.role || "member";

	let invitations: Invitation[] = [];

	try {
		if (userRole === "owner" || userRole === "admin") {
			const invitationsResult = await auth.api.listInvitations({
				headers: request.headers,
				query: {
					organizationId,
				},
			});
			invitations = invitationsResult.filter((i) => i.status === "pending");
		}
	} catch (e) {
		console.error("Failed to list invitations:", e);
	}

	// Use mediaDb with organization context
	const userMedia = mediaDb.list(organizationId);

	// Calculate total storage used
	const totalSize = userMedia.reduce((acc, item) => acc + (item.fileSize || 0), 0);

	// Count media by status
	const mediaStats = {
		total: userMedia.length,
		complete: userMedia.filter((m) => m.status === "complete").length,
		downloading: userMedia.filter(
			(m) => m.status === "pending" || m.status === "searching" || m.status === "downloading"
		).length,
		error: userMedia.filter((m) => m.status === "error").length,
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
