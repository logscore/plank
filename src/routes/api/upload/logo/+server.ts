import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { schema } from '$lib/server/db/schema';
import { processAndSave, validateImage } from '$lib/server/image-processing';
import { imageStorage } from '$lib/server/storage';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const formData = await request.formData();
	const file = formData.get('file');
	const organizationId = formData.get('organizationId');

	if (!(file && file instanceof File)) {
		throw error(400, 'No file provided');
	}

	if (!organizationId || typeof organizationId !== 'string') {
		throw error(400, 'Organization ID required');
	}

	const membership = db
		.select({ role: schema.member.role })
		.from(schema.member)
		.where(and(eq(schema.member.userId, locals.user.id), eq(schema.member.organizationId, organizationId)))
		.get();

	if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
		throw error(403, 'Only owners and admins can update organization logo');
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const validation = validateImage(buffer, file.type);

	if (!validation.valid) {
		throw error(400, validation.error);
	}

	const currentOrg = db
		.select({ logo: schema.organization.logo })
		.from(schema.organization)
		.where(eq(schema.organization.id, organizationId))
		.get();

	if (currentOrg?.logo) {
		try {
			await imageStorage.delete(currentOrg.logo);
		} catch {
			// File may not exist, ignore
		}
	}

	const relativePath = await processAndSave(buffer, 'logos', organizationId);

	db.update(schema.organization).set({ logo: relativePath }).where(eq(schema.organization.id, organizationId)).run();

	return json({ success: true, logo: `/images/${relativePath}` });
};
