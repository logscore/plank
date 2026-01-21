class UIState {
	addMovieDialogOpen = $state(false);
	deleteConfirmation = $state({
		open: false,
		title: '',
		description: '',
		confirmAction: async () => {
			// Default no-op action
		},
	});

	toggleAddMovieDialog() {
		this.addMovieDialogOpen = !this.addMovieDialogOpen;
	}
}

export const uiState = new UIState();

export function confirmDelete(
	title: string,
	description: string,
	onConfirm: () => Promise<void> | void
) {
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
