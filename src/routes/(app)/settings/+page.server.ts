import { fail, redirect } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { getSettings, updateSettings } from "$lib/server/settings";
import type { Actions, PageServerLoad } from "./$types";

function parseTrustedGroups(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split(",")
		.map((group) => group.trim())
		.filter((group) => group.length > 0);
}

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		throw redirect(302, "/login");
	}
	if (!locals.session?.activeOrganizationId) {
		throw redirect(302, "/profiles");
	}

	const permission = await auth.api.getActiveMemberRole({
		headers: request.headers,
		query: { organizationId: locals.session.activeOrganizationId },
	});

	if (!permission || permission.role !== "owner") {
		throw redirect(302, "/");
	}

	const settings = await getSettings();

	return {
		settings,
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { success: false, error: "Unauthorized" });
		}
		if (!locals.session?.activeOrganizationId) {
			return fail(403, { success: false, error: "Active profile required" });
		}

		const permission = await auth.api.getActiveMemberRole({
			headers: request.headers,
			query: { organizationId: locals.session.activeOrganizationId },
		});
		if (!permission || permission.role !== "owner") {
			return fail(403, { success: false, error: "Only owners can update settings" });
		}

		const formData = await request.formData();
		const tmdbApiKey = formData.get("tmdbApiKey")?.toString() || "";
		const prowlarrUrl = formData.get("prowlarrUrl")?.toString() || "";
		const prowlarrApiKey = formData.get("prowlarrApiKey")?.toString() || "";
		const prowlarrMinSeedersStr = formData.get("prowlarrMinSeeders")?.toString();
		const prowlarrTrustedGroupsStr = formData.get("prowlarrTrustedGroups")?.toString();
		const opensubtitlesApiKey = formData.get("opensubtitlesApiKey")?.toString() || "";
		const opensubtitlesUsername = formData.get("opensubtitlesUsername")?.toString() || "";
		const opensubtitlesPassword = formData.get("opensubtitlesPassword")?.toString() || "";

		const prowlarrMinSeeders = prowlarrMinSeedersStr ? Number.parseInt(prowlarrMinSeedersStr, 10) : 5;
		const prowlarrTrustedGroups = parseTrustedGroups(prowlarrTrustedGroupsStr);

		try {
			await updateSettings({
				tmdbApiKey,
				prowlarrUrl,
				prowlarrApiKey,
				prowlarrMinSeeders,
				prowlarrTrustedGroups,
				opensubtitlesApiKey,
				opensubtitlesUsername,
				opensubtitlesPassword,
			});
		} catch (err) {
			console.error("Failed to update settings:", err);
			return fail(500, { success: false, error: "Failed to update settings" });
		}

		return { success: true };
	},
};
