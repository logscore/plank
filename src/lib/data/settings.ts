import { createMutation } from "@tanstack/svelte-query";
import { apiRequest } from "./client";

export type ConnectionTarget = "tmdb" | "opensubtitles" | "prowlarr";

export interface TestSettingsConnectionInput {
	opensubtitlesApiKey?: string;
	opensubtitlesPassword?: string;
	opensubtitlesUsername?: string;
	prowlarrApiKey?: string;
	prowlarrUrl?: string;
	target: ConnectionTarget;
	tmdbApiKey?: string;
}

export interface SettingsConnectionResult {
	message: string;
	success: boolean;
}

export function createTestSettingsConnectionMutation() {
	return createMutation<SettingsConnectionResult, Error, TestSettingsConnectionInput>(() => ({
		mutationFn: async (input) => {
			const result = await apiRequest<SettingsConnectionResult | undefined>(
				"/api/settings/test-connection",
				"Connection test failed",
				{ json: input, method: "POST" }
			);
			return result ?? { message: "Connection test returned no data", success: false };
		},
	}));
}
