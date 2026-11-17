import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, "/login");
	}

	// Get this user's memberships
	const userMembers = db.select().from(schema.member).where(eq(schema.member.userId, locals.user.id)).all();

	const memberOrgIds = new Set(userMembers.map((m) => m.organizationId));
	const canManageProfiles = userMembers.some((m) => m.role === "owner");

	const allOrgs = db
		.select({ id: schema.organization.id, name: schema.organization.name, logo: schema.organization.logo })
		.from(schema.organization)
		.all();

	if (allOrgs.length === 0) {
		throw redirect(302, "/onboarding");
	}

	const profiles = allOrgs.map((org) => ({
		id: memberOrgIds.has(org.id) ? org.id : null,
		name: org.name,
		logo: memberOrgIds.has(org.id) ? org.logo : null,
		isMember: memberOrgIds.has(org.id),
	}));

	return {
		profiles,
		canManageProfiles,
	};
};
