import { error, json } from "@sveltejs/kit";
import { mediaDb } from "$lib/server/db";
import { type AddMediaFromMagnetParams, addMediaFromMagnet, isBrowseSeasonRequest } from "$lib/server/media-library";
import { addSeasonFromBrowse } from "$lib/server/season-sync";
import type { MediaType } from "$lib/types";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(403, "Active profile required");
	}

	const type = url.searchParams.get("type") as MediaType | null;
	const list = mediaDb.list(organizationId, type ?? undefined);
	return json(list);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!(locals.user && organizationId)) {
		throw error(403, "Active profile required");
	}

	const body = (await request.json()) as Record<string, unknown>;

	if (isBrowseSeasonRequest(body)) {
		const result = await addSeasonFromBrowse(locals.user.id, organizationId, body);
		return json(result, { status: 202 });
	}

	const result = await addMediaFromMagnet(
		locals.user.id,
		organizationId,
		body as unknown as AddMediaFromMagnetParams
	);
	return json(result.body, { status: result.status });
};
