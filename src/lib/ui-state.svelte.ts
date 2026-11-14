type ConfirmTone = "default" | "destructive";

interface Confirmation {
	confirmAction: () => Promise<void> | void;
	confirmLabel: string;
	description: string;
	open: boolean;
	title: string;
	tone: ConfirmTone;
}

export interface ConfirmOptions {
	/** Text on the confirm button. */
	confirmLabel?: string;
	description: string;
	onConfirm: () => Promise<void> | void;
	title: string;
	/** `destructive` paints the confirm button red. */
	tone?: ConfirmTone;
}

class UIState {
	addMediaDialogOpen = $state(false);
	inviteMemberDialogOpen = $state(false);

	confirmation = $state<Confirmation>({
		confirmAction: () => {
			// Default no-op action
		},
		confirmLabel: "Confirm",
		description: "",
		open: false,
		title: "",
		tone: "destructive",
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
		confirmAction: options.onConfirm,
		confirmLabel: options.confirmLabel ?? "Confirm",
		description: options.description,
		open: true,
		title: options.title,
		tone: options.tone ?? "default",
	};
}

/** Shorthand for the common case: a red button that destroys data. */
export function confirmDelete(title: string, description: string, onConfirm: () => Promise<void> | void) {
	openConfirmation({ description, onConfirm, title, tone: "destructive" });
}
