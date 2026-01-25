import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
	baseURL: import.meta.env.BETTER_AUTH_URL,
	plugins: [organizationClient()],
});
