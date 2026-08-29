import { fail, type RequestEvent } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { getSettings, updateSettings } from "$lib/server/settings";
import { requireSection, toSettingsRole } from "../sections";
import type { Actions, PageServerLoad } from "./$types";

const SECTION_HREF = "/settings/connections";
const DEFAULT_MIN_SEEDERS = 5;

type ConnectionUpdate = Parameters<typeof updateSettings>[0];

export const load: PageServerLoad = async ({ parent }) => {
	const { userRole } = await parent();
	requireSection(userRole, SECTION_HREF);

	return {
		settings: await getSettings(),
	};
};

/** Form actions run outside the layout load, so they must check the role again. */
async function isOwner(event: RequestEvent): Promise<boolean> {
	const organizationId = event.locals.session?.activeOrganizationId;
	if (!organizationId) {
		return false;
	}

	const permission = await auth.api
		.getActiveMemberRole({
			headers: event.request.headers,
			query: { organizationId },
		})
		.catch(() => null);

	return toSettingsRole(permission?.role) === "owner";
}

/** Save one connection. Fields the form does not send stay unchanged. */
async function saveConnection(
	event: RequestEvent,
	build: (formData: FormData) => ConnectionUpdate
): Promise<{ success: true } | ReturnType<typeof fail>> {
	if (!(await isOwner(event))) {
		return fail(403, { error: "Only owners can change connections" });
	}

	const formData = await event.request.formData();

	try {
		await updateSettings(build(formData));
	} catch (err) {
		console.error("Failed to update connection:", err);
		return fail(500, { error: "Failed to save the connection" });
	}

	return { success: true };
}

function parseMinSeeders(value: string | undefined): number {
	const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
	if (Number.isNaN(parsed) || parsed < 0) {
		return DEFAULT_MIN_SEEDERS;
	}
	return parsed;
}

export const actions: Actions = {
	tmdb: (event) =>
		saveConnection(event, (formData) => ({
			tmdbApiKey: formData.get("tmdbApiKey")?.toString() || "",
		})),

	opensubtitles: (event) =>
		saveConnection(event, (formData) => ({
			opensubtitlesApiKey: formData.get("opensubtitlesApiKey")?.toString() || "",
			opensubtitlesUsername: formData.get("opensubtitlesUsername")?.toString() || "",
			opensubtitlesPassword: formData.get("opensubtitlesPassword")?.toString() || "",
		})),

	prowlarr: (event) =>
		saveConnection(event, (formData) => ({
			prowlarrUrl: formData.get("prowlarrUrl")?.toString() || "",
			prowlarrApiKey: formData.get("prowlarrApiKey")?.toString() || "",
			prowlarrMinSeeders: parseMinSeeders(formData.get("prowlarrMinSeeders")?.toString()),
		})),
};
