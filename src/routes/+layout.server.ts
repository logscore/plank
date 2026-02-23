import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { user as userTable } from '$lib/server/db/schema';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return { user: null };
	}

	const dbUser = db.select({ image: userTable.image }).from(userTable).where(eq(userTable.id, locals.user.id)).get();

	return {
		user: { ...locals.user, image: dbUser?.image ?? null },
	};
};
