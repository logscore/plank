import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { schema } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Admin access required');
	}

	const body = await request.json();
	const updates: Record<string, unknown> = {};

	if (body.name !== undefined) {
		updates.name = body.name;
	}
	if (body.color !== undefined) {
		updates.color = body.color;
	}

	if (Object.keys(updates).length === 0) {
		throw error(400, 'No updates provided');
	}

	db.update(schema.organization).set(updates).where(eq(schema.organization.id, params.id)).run();

	const updated = db.select().from(schema.organization).where(eq(schema.organization.id, params.id)).get();
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Admin access required');
	}

	const org = db.select().from(schema.organization).where(eq(schema.organization.id, params.id)).get();
	if (!org) {
		throw error(404, 'Profile not found');
	}

	// Delete the organization (cascades to members, invitations, and media via FK)
	db.delete(schema.organization).where(eq(schema.organization.id, params.id)).run();

	return json({ success: true });
};
