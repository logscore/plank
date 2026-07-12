import { json } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { testProwlarrConnection } from "$lib/server/prowlarr";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		return json({ error: "Active profile required" }, { status: 403 });
	}

	const permission = await auth.api.getActiveMemberRole({
		headers: request.headers,
		query: { organizationId },
	});
	if (permission.role !== "owner") {
		return json({ error: "Only owners can manage app settings" }, { status: 403 });
	}

	const { url, apiKey } = await request.json();
	const result = await testProwlarrConnection(url, apiKey);

	return json(result);
};
