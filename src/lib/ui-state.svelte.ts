class UIState {
	addMediaDialogOpen = $state(false);
	inviteMemberDialogOpen = $state(false);

	deleteConfirmation = $state({
		open: false,
		title: '',
		description: '',
		confirmAction: async () => {
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

export function confirmDelete(title: string, description: string, onConfirm: () => Promise<void> | void) {
	uiState.deleteConfirmation = {
		open: true,
		title,
		description,
		confirmAction: async () => {
			await onConfirm();
			uiState.deleteConfirmation.open = false;
		},
	};
}
