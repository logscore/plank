type ConfirmTone = "default" | "destructive";

interface Confirmation {
	open: boolean;
	title: string;
	description: string;
	tone: ConfirmTone;
	confirmLabel: string;
	confirmAction: () => Promise<void> | void;
}

export interface ConfirmOptions {
	title: string;
	description: string;
	/** Text on the confirm button. */
	confirmLabel?: string;
	/** `destructive` paints the confirm button red. */
	tone?: ConfirmTone;
	onConfirm: () => Promise<void> | void;
}

class UIState {
	addMediaDialogOpen = $state(false);
	inviteMemberDialogOpen = $state(false);

	confirmation = $state<Confirmation>({
		open: false,
		title: "",
		description: "",
		tone: "destructive",
		confirmLabel: "Confirm",
		confirmAction: () => {
			// Default no-op action
		},
	});

	toggleAddMediaDialog() {
		this.addMediaDialogOpen = !this.addMediaDialogOpen;
	}

	toggleInviteMemberDialog() {
		this.inviteMemberDialogOpen = !this.inviteMemberDialogOpen;
	}
}

export const uiState = new UIState();

/** Open the shared confirmation dialog. ConfirmationDialog closes it once the action settles. */
export function openConfirmation(options: ConfirmOptions) {
	uiState.confirmation = {
		open: true,
		title: options.title,
		description: options.description,
		tone: options.tone ?? "default",
		confirmLabel: options.confirmLabel ?? "Confirm",
		confirmAction: options.onConfirm,
	};
}

/** Shorthand for the common case: a red button that destroys data. */
export function confirmDelete(title: string, description: string, onConfirm: () => Promise<void> | void) {
	openConfirmation({ title, description, tone: "destructive", onConfirm });
}
