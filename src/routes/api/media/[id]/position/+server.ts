import { error, json } from '@sveltejs/kit';
import { episodesDb, mediaDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const episodeId = url.searchParams.get('episodeId');

	if (episodeId) {
		const episode = episodesDb.getById(episodeId);
		return json({
			position: episode?.playPosition ?? 0,
			duration: episode?.playDuration ?? null,
		});
	}

	const mediaItem = mediaDb.get(params.id, organizationId);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	return json({
		position: mediaItem.playPosition ?? 0,
		duration: mediaItem.playDuration ?? null,
	});
};

export const PUT: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		throw error(400, 'No active profile selected');
	}

	const { position, duration, episodeId } = await request.json();

	if (typeof position !== 'number' || position < 0) {
		throw error(400, 'Invalid position');
	}

	const mediaItem = mediaDb.get(params.id, organizationId);
	if (!mediaItem) {
		throw error(404, 'Media not found');
	}

	if (episodeId) {
		episodesDb.updatePlayPosition(episodeId, position, duration);
	} else {
		mediaDb.updatePlayPosition(params.id, position, duration);
	}

	mediaDb.updateLastPlayed(params.id);

	return new Response(null, { status: 204 });
};

/** POST handler for navigator.sendBeacon (sends text/plain) */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		return new Response(null, { status: 401 });
	}

	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		return new Response(null, { status: 400 });
	}

	const contentType = request.headers.get('content-type') ?? '';
	let body: { position: number; duration?: number; episodeId?: string };

	if (contentType.includes('text/plain')) {
		body = JSON.parse(await request.text());
	} else {
		body = await request.json();
	}

	const { position, duration, episodeId } = body;
	if (typeof position !== 'number' || position < 0) {
		return new Response(null, { status: 400 });
	}

	const mediaItem = mediaDb.get(params.id, organizationId);
	if (!mediaItem) {
		return new Response(null, { status: 404 });
	}

	if (episodeId) {
		episodesDb.updatePlayPosition(episodeId, position, duration);
	} else {
		mediaDb.updatePlayPosition(params.id, position, duration);
	}

	mediaDb.updateLastPlayed(params.id);

	return new Response(null, { status: 204 });
};
