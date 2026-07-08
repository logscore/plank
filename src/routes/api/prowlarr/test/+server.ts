import { json } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { testProwlarrConnection } from "$lib/server/prowlarr";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
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
		return json({ error: "Only owners can test Prowlarr" }, { status: 403 });
	}

	const { url, apiKey } = await request.json();
	const result = await testProwlarrConnection(url, apiKey);

	return json(result);
};
