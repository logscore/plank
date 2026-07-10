import { type Handle, type RequestEvent, redirect } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { tempFolderCleanupJob } from "$lib/server/cron-jobs";
import { db } from "$lib/server/db/index";
import { schema } from "$lib/server/db/schema";
import { recoverDownloads } from "$lib/server/torrent/recovery";

// Recover incomplete downloads on server startup
recoverDownloads().catch((e: Error) => {
	console.error("[Startup] Failed to recover downloads:", e.message);
});

// Start scheduled tasks
tempFolderCleanupJob();

function classifyRoute(path: string) {
	const isAuthPage = path.startsWith("/login") || path.startsWith("/register");
	return {
		isAuthPage,
		isAuthRoute: isAuthPage || path.startsWith("/api/auth"),
		isApiRoute: path.startsWith("/api"),
		isProfilesRoute: path === "/profiles" || path.startsWith("/profiles/"),
		isOnboardingRoute: path.startsWith("/onboarding"),
		isAcceptInvitation: path.startsWith("/accept-invitation"),
		isAppRoute:
			path === "/" ||
			path.startsWith("/watch") ||
			path.startsWith("/search") ||
			path.startsWith("/account") ||
			path.startsWith("/browse") ||
			path.startsWith("/settings") ||
			path.startsWith("/movie") ||
			path.startsWith("/show") ||
			path.startsWith("/onboarding") ||
			path === "/profiles" ||
			path.startsWith("/profiles/"),
	};
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
		const existingOrg = db.select({ id: schema.organization.id }).from(schema.organization).limit(1).get();
		throw redirect(302, existingOrg ? "/profiles" : "/onboarding");
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

	throw redirect(302, "/profiles");
}

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	const routes = classifyRoute(event.url.pathname);

	if (routes.isApiRoute && !routes.isAuthRoute && !event.locals.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	if (routes.isAppRoute && !event.locals.user) {
		throw redirect(302, "/login");
	}

	if (routes.isAuthPage && event.locals.user) {
		throw redirect(302, "/profiles");
	}

	if (routes.isProfilesRoute || routes.isAcceptInvitation) {
		return resolve(event);
	}

	if (
		routes.isOnboardingRoute &&
		db.select({ id: schema.organization.id }).from(schema.organization).limit(1).get()
	) {
		throw redirect(302, "/profiles");
	}

	if (routes.isAppRoute && !routes.isOnboardingRoute) {
		await enforceProfileSelection(event, event.locals.session?.activeOrganizationId);
	}

	return resolve(event);
};
