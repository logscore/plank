import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db/index';
import { schema } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (!session?.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	// Get user's organizations through member table
	const organizations = await db.query.member.findMany({
		where: eq(schema.member.userId, session.user.id),
		with: {
			organization: true,
		},
	});

	return json(organizations.map((member) => member.organization));
};

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	if (!session?.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const body = await request.json();

	try {
		// Create organization using Better Auth
		const organization = await auth.api.createOrganization({
			body: {
				name: body.name,
				slug: body.slug,
				logo: body.logo,
				metadata: body.metadata,
			},
			headers: request.headers,
		});

		return json(organization, { status: 201 });
	} catch (error) {
		console.error('Failed to create organization:', error);
		return json({ error: 'Failed to create organization' }, { status: 400 });
	}
};
