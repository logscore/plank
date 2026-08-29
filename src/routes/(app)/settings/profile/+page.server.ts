import { mediaDb } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
	const { organization } = await parent();
	const media = mediaDb.list(organization.id);
	const totalSize = media.reduce((total, item) => total + (item.fileSize || 0), 0);

	return {
		stats: {
			total: media.length,
			totalSize,
		},
	};
};
