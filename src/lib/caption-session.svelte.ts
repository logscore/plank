interface CaptionSelection {
	trackId: string | null;
	enabled: boolean;
}

// Shared by details and playback, and intentionally cleared on a full page reload.
const selections = $state<Record<string, CaptionSelection | undefined>>({});

export function getCaptionSelection(mediaId: string): CaptionSelection | undefined {
	return selections[mediaId];
}

export function setCaptionSelection(mediaId: string, trackId: string | null, enabled: boolean): void {
	selections[mediaId] = { trackId, enabled: enabled && trackId !== null };
}
