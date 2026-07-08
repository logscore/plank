import { redirect } from "@sveltejs/kit";
import { eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, "/login");
	}

	const userMembers = db.select().from(schema.member).where(eq(schema.member.userId, locals.user.id)).all();
	if (!userMembers.some((m) => m.role === "owner")) {
		throw redirect(302, "/profiles");
	}
	const roleByOrgId = new Map(userMembers.map((m) => [m.organizationId, m.role]));

	// Get ALL organizations with member counts
	const allOrgs = db.select().from(schema.organization).all();

	const memberCounts = db
		.select({
			organizationId: schema.member.organizationId,
			count: sql<number>`count(*)`,
		})
		.from(schema.member)
		.groupBy(schema.member.organizationId)
		.all();

	const countMap = new Map(memberCounts.map((mc) => [mc.organizationId, mc.count]));

	const profiles = allOrgs.map((org) => ({
		id: org.id,
		name: org.name,
		slug: org.slug,
		logo: org.logo,
		memberCount: countMap.get(org.id) ?? 0,
		canUpdate: roleByOrgId.get(org.id) === "owner" || roleByOrgId.get(org.id) === "admin",
		canDelete: roleByOrgId.get(org.id) === "owner",
	}));

	return { profiles };
};
