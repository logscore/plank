import type { Invitation } from "better-auth/plugins";
import { auth } from "$lib/server/auth";
import { requireSection } from "../sections";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent, request }) => {
	const { organization, userRole } = await parent();
	requireSection(userRole, "/settings/members");

	let invitations: Invitation[] = [];
	try {
		const result = await auth.api.listInvitations({
			headers: request.headers,
			query: { organizationId: organization.id },
		});
		invitations = result.filter((invitation) => invitation.status === "pending");
	} catch (e) {
		console.error("Failed to list invitations:", e);
	}

	return { invitations };
};
