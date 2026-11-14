import fs from "node:fs/promises";
import path from "node:path";
import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { appendChunk, readChunkRequest } from "$lib/server/chunk-upload";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import { MAX_FILE_SIZE, replaceImage, sanitizeFilename } from "$lib/server/images";
import { PATHS } from "$lib/server/paths";
import type { RequestHandler } from "./$types";

/** Receive one chunk of the avatar image. The body is the raw chunk bytes. */
export const PUT: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		throw error(401, "Unauthorized");
	}

	const userId = locals.user.id;
	const { chunk, fileSize, offset } = await readChunkRequest(request, url, MAX_FILE_SIZE);
	const partPath = path.join(PATHS.temp, "uploads", `avatar-${sanitizeFilename(userId)}.part`);
	const received = await appendChunk(partPath, fileSize, offset, chunk);
	if (received < fileSize) {
		return json({ received });
	}
	const buffer = await fs.readFile(partPath);
	await fs.rm(partPath, { force: true });

	const currentUser = db
		.select({ image: schema.user.image })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.get();

	const result = await replaceImage(currentUser?.image, buffer, "avatars", userId);

	if ("error" in result) {
		throw error(400, result.error);
	}

	db.update(schema.user).set({ image: result.imagePath }).where(eq(schema.user.id, userId)).run();

	return json({ success: true, image: result.imagePath, received });
};
