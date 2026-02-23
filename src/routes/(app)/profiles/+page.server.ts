import { redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { schema } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const isAdmin = locals.user.role === 'admin';

	// Get ALL organizations (profiles)
	const allOrgs = db.select().from(schema.organization).all();

	// Admin with no profiles should go to onboarding
	if (allOrgs.length === 0 && isAdmin) {
		throw redirect(302, '/onboarding');
	}

	// Get this user's memberships
	const userMembers = db.select().from(schema.member).where(eq(schema.member.userId, locals.user.id)).all();

	const memberOrgIds = new Set(userMembers.map((m) => m.organizationId));

	// Get member counts per org
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
		color: org.color,
		logo: org.logo,
		isMember: memberOrgIds.has(org.id),
		memberCount: countMap.get(org.id) ?? 0,
	}));

	return {
		profiles,
		isAdmin,
	};
};
