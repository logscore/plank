class UIState {
  addMovieDialogOpen = $state(false);

  toggleAddMovieDialog() {
    this.addMovieDialogOpen = !this.addMovieDialogOpen;
  }
}

export const uiState = new UIState();
