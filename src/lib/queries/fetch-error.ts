export interface FetchError extends Error {
	status?: number;
}

export function createFetchError(message: string, status?: number): FetchError {
	const err = new Error(message) as FetchError;
	err.status = status;
	return err;
}
