import { createMutation } from "@tanstack/svelte-query";

export type ConnectionTarget = "tmdb" | "opensubtitles" | "prowlarr";

export interface TestSettingsConnectionInput {
	target: ConnectionTarget;
	tmdbApiKey?: string;
	prowlarrUrl?: string;
	prowlarrApiKey?: string;
	opensubtitlesApiKey?: string;
	opensubtitlesUsername?: string;
	opensubtitlesPassword?: string;
}

export interface SettingsConnectionResult {
	success: boolean;
	message: string;
}

export function createTestSettingsConnectionMutation() {
	return createMutation<SettingsConnectionResult, Error, TestSettingsConnectionInput>(() => ({
		mutationFn: async (input) => {
			const response = await fetch("/api/settings/test-connection", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			const result = (await response.json().catch(() => null)) as SettingsConnectionResult | null;
			if (!response.ok) {
				throw new Error(result?.message || `Connection test failed (${response.status})`);
			}
			return result ?? { success: false, message: "Connection test returned no data" };
		},
	}));
}
