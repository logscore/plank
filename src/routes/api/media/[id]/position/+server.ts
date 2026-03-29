import { error, json } from '@sveltejs/kit';
import { requireMediaAccess } from '$lib/server/api-guard';
import { mediaDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

function savePosition(mediaId: string, position: number, duration?: number): void {
	mediaDb.updatePlayPosition(mediaId, position, duration);
	mediaDb.updateLastPlayed(mediaId);
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const { mediaItem } = requireMediaAccess(locals, params.id);
	return json({
		position: mediaItem.playPosition ?? 0,
		duration: mediaItem.playDuration ?? null,
	});
};

export const PUT: RequestHandler = async ({ params, locals, request }) => {
	requireMediaAccess(locals, params.id);
	const { position, duration } = (await request.json()) as { position: number; duration?: number };
	if (typeof position !== 'number' || position < 0) {
		throw error(400, 'Invalid position');
	}
	savePosition(params.id, position, duration);
	return new Response(null, { status: 204 });
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) {
		return new Response(null, { status: 401 });
	}
	if (!locals.session?.activeOrganizationId) {
		return new Response(null, { status: 400 });
	}
	const contentType = request.headers.get('content-type') ?? '';
	const body = contentType.includes('text/plain')
		? (JSON.parse(await request.text()) as { position: number; duration?: number })
		: ((await request.json()) as { position: number; duration?: number });
	if (typeof body.position !== 'number' || body.position < 0) {
		return new Response(null, { status: 400 });
	}
	const mediaItem = mediaDb.get(params.id, locals.session.activeOrganizationId);
	if (!mediaItem) {
		return new Response(null, { status: 404 });
	}
	savePosition(params.id, body.position, body.duration);
	return new Response(null, { status: 204 });
};
