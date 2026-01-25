import { type Handle, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { tempFolderScheduler, transcodeScheduler } from '$lib/server/scheduler';
import { recoverDownloads } from '$lib/server/torrent';

// Recover incomplete downloads on server startup
recoverDownloads().catch((e) => {
	console.error('[Startup] Failed to recover downloads:', e);
});

// Start scheduled tasks
// Start scheduled tasks
transcodeScheduler();
tempFolderScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({
		headers: event.request.headers,
	});

	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Protect app routes
	const isAppRoute =
		event.url.pathname.startsWith('/watch') ||
		event.url.pathname.startsWith('/search') ||
		event.url.pathname.startsWith('/account') ||
		event.url.pathname.startsWith('/browse') ||
		event.url.pathname.startsWith('/onboarding') ||
		event.url.pathname === '/';
	const isAuthRoute =
		event.url.pathname.startsWith('/login') ||
		event.url.pathname.startsWith('/register') ||
		event.url.pathname.startsWith('/api/auth');
	const isAuthPage = event.url.pathname.startsWith('/login') || event.url.pathname.startsWith('/register');
	const isApiRoute = event.url.pathname.startsWith('/api');
	const isOnboardingRoute = event.url.pathname.startsWith('/onboarding');

	if (isAppRoute && !event.locals.user) {
		throw redirect(302, '/login');
	}

	// Redirect logged-in users away from auth pages (but allow api/auth)
	if (isAuthPage && event.locals.user) {
		throw redirect(302, '/');
	}

	// Enforce organization setup for app routes
	if (isAppRoute && !isOnboardingRoute && event.locals.user) {
		// Check if user has an organization
		const orgs = await auth.api.listOrganizations({
			headers: event.request.headers,
		});

		if (!orgs || orgs.length === 0) {
			throw redirect(302, '/onboarding');
		}
	}

	// Protect API routes (except auth routes)
	if (isApiRoute && !isAuthRoute && !event.locals.user) {
		// Return 401 for API requests instead of redirect
		return new Response('Unauthorized', { status: 401 });
	}

	return resolve(event);
};
