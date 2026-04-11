import path from 'node:path';
import { error } from '@sveltejs/kit';
import { getOrganizationIdFromStorageKey, getStoredFileMetadata, readStoredFile } from '$lib/server/storage';
import type { RequestHandler } from './$types';

// Regex to prevent directory traversal
const DIRECTORY_TRAVERSAL_REGEX = /^(\.\.(\/|\\|$))+/;

export const GET: RequestHandler = async ({ params }) => {
	if (!params.path) {
		throw error(404, 'Not Found');
	}

	const safePath = path.normalize(params.path).replace(DIRECTORY_TRAVERSAL_REGEX, '');
	const organizationId = getOrganizationIdFromStorageKey(safePath);

	try {
		const metadata = await getStoredFileMetadata(safePath, organizationId);
		if (!metadata) {
			throw error(404, 'Not Found');
		}

		const file = await readStoredFile(safePath, organizationId);
		const ext = path.extname(safePath).toLowerCase();

		let contentType = 'application/octet-stream';
		switch (ext) {
			case '.jpg':
			case '.jpeg':
				contentType = 'image/jpeg';
				break;
			case '.png':
				contentType = 'image/png';
				break;
			case '.webp':
				contentType = 'image/webp';
				break;
			case '.gif':
				contentType = 'image/gif';
				break;
			case '.svg':
				contentType = 'image/svg+xml';
				break;
			default:
				// Keep application/octet-stream for unknown types
				break;
		}

		return new Response(new Uint8Array(file), {
			headers: {
				'Content-Type': contentType,
				'Content-Length': metadata.size.toString(),
				'Cache-Control': 'public, max-age=31536000',
			},
		});
	} catch (_e) {
		throw error(404, 'Not Found');
	}
};
