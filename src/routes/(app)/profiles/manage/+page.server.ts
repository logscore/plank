import { redirect } from "@sveltejs/kit";
import { eq, sql } from "drizzle-orm";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(302, "/login");
	}

	const userMembers = db
		.select({ role: schema.member.role })
		.from(schema.member)
		.where(eq(schema.member.userId, locals.user.id))
		.all();
	if (!userMembers.some((m) => m.role === "owner")) {
		throw redirect(302, "/profiles");
	}

	// We can use listOrganizations here because only owners can access this page, so it'll
	// always return all orgs in the app, ulike in /profiles which would only return that
	// users orgs so we do the db query.
	const allOrgs = await auth.api.listOrganizations({ headers: request.headers });

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
		logo: org.logo,
		memberCount: countMap.get(org.id) ?? 0,
	}));

	return { profiles };
};
