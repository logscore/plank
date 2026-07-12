import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import { replaceImage } from "$lib/server/images";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized", message: "Unauthorized" }, { status: 401 });
	}

	const formData = await request.formData();
	const file = formData.get("file");
	const organizationId = locals.session?.activeOrganizationId;

	if (!(file && file instanceof File)) {
		return json({ error: "No file provided", message: "No file provided" }, { status: 400 });
	}

	if (!organizationId) {
		return json({ error: "Organization ID required", message: "Organization ID required" }, { status: 400 });
	}

	const permission = await auth.api.hasPermission({
		headers: request.headers,
		body: {
			organizationId,
			permissions: { organization: ["update"] },
		},
	});

	if (!permission.success) {
		return json(
			{
				error: "Only owners and admins can update organization logo",
				message: "Only owners and admins can update organization logo",
			},
			{ status: 403 }
		);
	}

	const currentOrg = db
		.select({ logo: schema.organization.logo })
		.from(schema.organization)
		.where(eq(schema.organization.id, organizationId))
		.get();

	const buffer = Buffer.from(await file.arrayBuffer());
	const result = await replaceImage(currentOrg?.logo, buffer, "logos", organizationId);

	if ("error" in result) {
		return json({ error: result.error, message: result.error }, { status: 400 });
	}

	await auth.api.updateOrganization({
		headers: request.headers,
		body: {
			organizationId,
			data: { logo: result.imagePath },
		},
	});

	return json({ success: true, logo: result.imagePath });
};
