import { createMutation } from "@tanstack/svelte-query";
import { invalidate } from "$app/navigation";
import type { Media } from "$lib/types";

interface AddFromBrowseMagnetParams {
	mode?: "magnet";
	magnetLink: string;
	title: string;
	year?: number | null;
	tmdbId?: number;
}

interface AddSeasonFromBrowseParams {
	mode: "browse-season";
	tmdbId: number;
	seasonNumber: number;
	title: string;
	year?: number | null;
	posterUrl?: string | null;
	backdropUrl?: string | null;
	overview?: string | null;
	genres?: string[] | null;
	certification?: string | null;
}

interface AddSeasonFromBrowseResult {
	mode: "browse-season";
	status: "queued";
	showId: string;
	seasonId: string;
	seasonNumber: number;
	episodeCount: number;
}

export type AddFromBrowseParams = AddFromBrowseMagnetParams | AddSeasonFromBrowseParams;
export type AddFromBrowseResponse = Media | AddSeasonFromBrowseResult;

export function createAddFromBrowseMutation() {
	return createMutation<AddFromBrowseResponse, Error, AddFromBrowseParams>(() => ({
		mutationFn: async (params: AddFromBrowseParams): Promise<AddFromBrowseResponse> => {
			const response = await fetch("/api/media", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(params),
			});

			if (!response.ok) {
				throw new Error("Failed to add to library");
			}

			return response.json();
		},
		onSuccess: async () => {
			await invalidate("/api/media");
		},
	}));
}
