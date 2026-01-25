import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url, request }) => {
	const invitationId = params.id;

	if (!locals.user) {
		// Redirect to login with return URL
		throw redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	try {
		// Accept invitation
		await auth.api.acceptInvitation({
			body: {
				invitationId,
			},
			headers: request.headers,
		});

		// Redirect to home on success
		throw redirect(302, '/');
	} catch (error) {
		// If it's a redirect, re-throw it
		if (error && typeof error === 'object' && 'status' in error && 'location' in error) {
			throw error;
		}

		console.error('[Invitation] Failed to accept invitation:', error);

		// Extract better error message if available
		const errorMessage = 'Failed to accept invitation. It may be invalid or expired.';

		return {
			error: errorMessage,
		};
	}
};
