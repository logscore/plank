import fs from "node:fs/promises";
import path from "node:path";
import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { auth } from "$lib/server/auth";
import { appendChunk, readChunkRequest } from "$lib/server/chunk-upload";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import { MAX_FILE_SIZE, replaceImage, sanitizeFilename } from "$lib/server/images";
import { PATHS } from "$lib/server/paths";
import type { RequestHandler } from "./$types";

/** Receive one chunk of the organization logo. The body is the raw chunk bytes. */
export const PUT: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		return json({ error: "Unauthorized", message: "Unauthorized" }, { status: 401 });
	}

	const organizationId = url.searchParams.get("organizationId");
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

	const { chunk, fileSize, offset } = await readChunkRequest(request, url, MAX_FILE_SIZE);
	const partPath = path.join(PATHS.temp, "uploads", `logo-${sanitizeFilename(organizationId)}.part`);
	const received = await appendChunk(partPath, fileSize, offset, chunk);
	if (received < fileSize) {
		return json({ received });
	}
	const buffer = await fs.readFile(partPath);
	await fs.rm(partPath, { force: true });

	const currentOrg = db
		.select({ logo: schema.organization.logo })
		.from(schema.organization)
		.where(eq(schema.organization.id, organizationId))
		.get();

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

	return json({ success: true, logo: result.imagePath, received });
};
