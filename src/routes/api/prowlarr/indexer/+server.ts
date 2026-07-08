import { json } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { addProwlarrIndexer, deleteProwlarrIndexer, getProwlarrIndexers } from "$lib/server/prowlarr";
import type { RequestHandler } from "./$types";

async function canManageIndexers(headers: Headers, locals: App.Locals) {
	if (!locals.session?.activeOrganizationId) {
		return false;
	}
	const permission = await auth.api.getActiveMemberRole({
		headers,
		query: { organizationId: locals.session.activeOrganizationId },
	});
	return permission?.role === "owner";
}

export const GET: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!(await canManageIndexers(request.headers, locals))) {
		return json({ error: "Only owners can manage indexers" }, { status: 403 });
	}

	const indexers = await getProwlarrIndexers();
	return json(indexers);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!(await canManageIndexers(request.headers, locals))) {
		return json({ error: "Only owners can manage indexers" }, { status: 403 });
	}

	const data = await request.json();
	const success = await addProwlarrIndexer(data);

	if (success) {
		return json({ success: true });
	}
	return json({ error: "Failed to add indexer" }, { status: 500 });
};

export const DELETE: RequestHandler = async ({ request, url, locals }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!(await canManageIndexers(request.headers, locals))) {
		return json({ error: "Only owners can manage indexers" }, { status: 403 });
	}

	const id = url.searchParams.get("id");
	if (!id) {
		return json({ error: "Missing id" }, { status: 400 });
	}

	const success = await deleteProwlarrIndexer(Number.parseInt(id, 10));

	if (success) {
		return json({ success: true });
	}
	return json({ error: "Failed to delete indexer" }, { status: 500 });
};
