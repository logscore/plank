import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
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

	if (!(file && file instanceof File)) {
		throw error(400, 'No file provided');
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const validation = validateImage(buffer, file.type);

	if (!validation.valid) {
		throw error(400, validation.error);
	}

	const userId = locals.user.id;

	const currentUser = db
		.select({ image: schema.user.image })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.get();

	if (currentUser?.image) {
		try {
			await imageStorage.delete(currentUser.image);
		} catch {
			// File may not exist, ignore
		}
	}

	const relativePath = await processAndSave(buffer, 'avatars', userId);

	db.update(schema.user).set({ image: relativePath }).where(eq(schema.user.id, userId)).run();

	return json({ success: true, image: `/images/${relativePath}` });
};
