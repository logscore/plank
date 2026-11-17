import { createMutation } from "@tanstack/svelte-query";
import { apiRequest } from "./client";

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
			const result = await apiRequest<SettingsConnectionResult | undefined>(
				"/api/settings/test-connection",
				"Connection test failed",
				{ method: "POST", json: input }
			);
			return result ?? { success: false, message: "Connection test returned no data" };
		},
	}));
}
