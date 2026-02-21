import { redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { schema } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Admin-only page
	if (locals.user.role !== 'admin') {
		throw redirect(302, '/profiles');
	}

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
		color: org.color,
		memberCount: countMap.get(org.id) ?? 0,
	}));

	return { profiles };
};
