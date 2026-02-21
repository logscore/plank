import { type Handle, type RequestEvent, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db/index';
import { user as userTable } from '$lib/server/db/schema';
import { tempFolderScheduler, transcodeScheduler } from '$lib/server/scheduler';
import { recoverDownloads } from '$lib/server/torrent';

// Recover incomplete downloads on server startup
recoverDownloads().catch((e) => {
	console.error('[Startup] Failed to recover downloads:', e);
});

// Start scheduled tasks
transcodeScheduler();
tempFolderScheduler();

function classifyRoute(path: string) {
	const isAuthPage = path.startsWith('/login') || path.startsWith('/register');
	return {
		isAuthPage,
		isAuthRoute: isAuthPage || path.startsWith('/api/auth'),
		isApiRoute: path.startsWith('/api'),
		isProfilesRoute: path === '/profiles' || path.startsWith('/profiles/'),
		isOnboardingRoute: path.startsWith('/onboarding'),
		isAcceptInvitation: path.startsWith('/accept-invitation'),
		isAppRoute:
			path === '/' ||
			path.startsWith('/watch') ||
			path.startsWith('/search') ||
			path.startsWith('/account') ||
			path.startsWith('/browse') ||
			path.startsWith('/settings') ||
			path.startsWith('/movie') ||
			path.startsWith('/show') ||
			path.startsWith('/onboarding') ||
			path === '/profiles' ||
			path.startsWith('/profiles/'),
	};
}

function getUserRole(userId: string): string {
	const dbUser = db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, userId)).get();
	return dbUser?.role ?? 'user';
}

async function enforceProfileSelection(event: RequestEvent, activeOrgId: string | null | undefined) {
	if (activeOrgId) {
		return;
	}

	const orgs = await auth.api.listOrganizations({
		headers: event.request.headers,
	});
	const memberOrgs = orgs || [];

	if (memberOrgs.length === 0) {
		const isAdmin = event.locals.user?.role === 'admin';
		throw redirect(302, isAdmin ? '/onboarding' : '/profiles');
	}

	if (memberOrgs.length === 1) {
		await auth.api.setActiveOrganization({
			headers: event.request.headers,
			body: { organizationId: memberOrgs[0].id },
		});
		if (event.locals.session) {
			event.locals.session = {
				...event.locals.session,
				activeOrganizationId: memberOrgs[0].id,
			};
		}
		return;
	}

	throw redirect(302, '/profiles');
}

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({
		headers: event.request.headers,
	});

	if (session?.user) {
		const role = getUserRole(session.user.id);
		event.locals.user = { ...session.user, role };
	} else {
		event.locals.user = null;
	}
	event.locals.session = session?.session
		? {
				id: session.session.id,
				userId: session.session.userId,
				expiresAt: session.session.expiresAt,
				activeOrganizationId: session.session.activeOrganizationId ?? null,
			}
		: null;

	const routes = classifyRoute(event.url.pathname);

	if (routes.isAppRoute && !event.locals.user) {
		throw redirect(302, '/login');
	}

	if (routes.isAuthPage && event.locals.user) {
		throw redirect(302, '/profiles');
	}

	if (routes.isApiRoute && !routes.isAuthRoute && !event.locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (routes.isProfilesRoute || routes.isAcceptInvitation) {
		return resolve(event);
	}

	if (routes.isOnboardingRoute && event.locals.user?.role !== 'admin') {
		throw redirect(302, '/profiles');
	}

	if (routes.isAppRoute && event.locals.user && !routes.isOnboardingRoute) {
		await enforceProfileSelection(event, session?.session?.activeOrganizationId);
	}

	return resolve(event);
};
