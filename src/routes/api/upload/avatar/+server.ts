import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { schema } from '$lib/server/db/schema';
import { replaceStoredImage } from '$lib/server/image-processing';
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

	const userId = locals.user.id;

	const currentUser = db
		.select({ image: schema.user.image })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.get();

	const buffer = Buffer.from(await file.arrayBuffer());
	const result = await replaceStoredImage(currentUser?.image, buffer, file.type, 'avatars', userId);

	if ('error' in result) {
		throw error(400, result.error);
	}

	db.update(schema.user).set({ image: result.imagePath }).where(eq(schema.user.id, userId)).run();

	return json({ success: true, image: result.imagePath });
};
