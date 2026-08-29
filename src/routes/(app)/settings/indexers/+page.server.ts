import { getSettings } from "$lib/server/settings";
import { requireSection } from "../sections";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
	const { userRole } = await parent();
	requireSection(userRole, "/settings/indexers");

	const settings = await getSettings();

	return {
		hasProwlarr: settings.prowlarr.url.length > 0 && settings.prowlarr.apiKey.length > 0,
	};
};
