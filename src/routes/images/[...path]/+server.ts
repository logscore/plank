import fs from 'node:fs/promises';
import path from 'node:path';
import { error, type RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/config';

export const GET: RequestHandler = async ({ params }) => {
	if (!params.path) {
		throw error(404, 'Not Found');
	}

	// Prevent directory traversal
	const safePath = path.normalize(params.path).replace(/^(\.\.(\/|\\|$))+/, '');
	const filePath = path.join(config.paths.data, safePath);

	try {
		const stat = await fs.stat(filePath);
		if (!stat.isFile()) {
			throw error(404, 'Not Found');
		}

		const file = await fs.readFile(filePath);
		const ext = path.extname(filePath).toLowerCase();

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
		}

		return new Response(file, {
			headers: {
				'Content-Type': contentType,
				// Cache for a long time since images are content-addressed or immutable usually
				'Cache-Control': 'public, max-age=31536000',
			},
		});
	} catch (e) {
		throw error(404, 'Not Found');
	}
};
