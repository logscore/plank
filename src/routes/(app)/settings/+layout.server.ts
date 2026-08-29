import { redirect } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import type { LayoutServerLoad } from "./$types";
import { toSettingsRole } from "./sections";

export const load: LayoutServerLoad = async ({ locals, request }) => {
	const user = locals.user;
	if (!user) {
		throw redirect(302, "/login");
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
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

	const members = organization.members || [];
	const currentMember = members.find((member) => member.userId === user.id);

	return {
		user,
		organization,
		members,
		userRole: toSettingsRole(currentMember?.role),
	};
};
