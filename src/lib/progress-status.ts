// Shares progress terminal-state helpers across streaming and UI clients
// FEATURE: Live progress transport for movie and episode download monitoring

export function isTerminalProgressStatus(status: string | null | undefined): boolean {
	return status === 'complete' || status === 'error' || status === 'not_found' || status === 'removed';
}
