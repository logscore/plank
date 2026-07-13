import { auth } from "$lib/server/auth";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, request }) => {
	const organizationId = locals.session?.activeOrganizationId;
	const role = organizationId
		? await auth.api
				.getActiveMemberRole({
					headers: request.headers,
					query: { organizationId },
				})
				.then((member) => member?.role)
				.catch(() => undefined)
		: undefined;

	return { user: locals.user, role };
};
