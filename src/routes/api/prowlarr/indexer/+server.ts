import { json } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { addProwlarrIndexer, deleteProwlarrIndexer, getProwlarrIndexers } from "$lib/server/prowlarr";
import type { RequestHandler } from "./$types";

async function canManageIndexers(locals: App.Locals, request: Request) {
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		return false;
	}
	const permission = await auth.api.getActiveMemberRole({
		headers: request.headers,
		query: { organizationId },
	});
	return permission?.role === "owner";
}

export const GET: RequestHandler = async ({ request, locals }) => {
	if (!(await canManageIndexers(locals, request))) {
		return json({ error: "Only owners can manage indexers" }, { status: 403 });
	}

	const indexers = await getProwlarrIndexers();
	return json(indexers);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!(await canManageIndexers(locals, request))) {
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
	if (!(await canManageIndexers(locals, request))) {
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
