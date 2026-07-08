import { json } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { getProwlarrIndexerSchemas } from "$lib/server/prowlarr";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!locals.session?.activeOrganizationId) {
		return json({ error: "Active profile required" }, { status: 403 });
	}

	const permission = await auth.api.getActiveMemberRole({
		headers: request.headers,
		query: { organizationId: locals.session.activeOrganizationId },
	});
	if (!permission || permission.role !== "owner") {
		return json({ error: "Only owners can manage indexers" }, { status: 403 });
	}

	const schemas = await getProwlarrIndexerSchemas();
	return json(schemas);
};
