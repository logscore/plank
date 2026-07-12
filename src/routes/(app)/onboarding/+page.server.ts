import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import { getSettings } from "$lib/server/settings";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	if (db.select({ id: schema.organization.id }).from(schema.organization).limit(1).get()) {
		throw redirect(302, "/profiles");
	}

	const settings = await getSettings();

	return {
		settings,
	};
};
