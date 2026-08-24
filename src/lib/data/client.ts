import { QueryClient } from "@tanstack/svelte-query";

interface ApiErrorBody {
	error?: string;
	message?: string;
}

type ApiRequestOptions = RequestInit & { json?: unknown };

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30 * 60 * 1000,
			gcTime: 60 * 60 * 1000,
			retry: (failureCount, error) => {
				if (error && typeof error === "object" && "status" in error) {
					const status = error.status as number;
					if (status >= 400 && status < 500) {
						return false;
					}
				}
				return failureCount < 3;
			},
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
		},
		mutations: {
			retry: 1,
		},
	},
});

function getApiErrorMessage(body: unknown): string | undefined {
	if (!(body && typeof body === "object")) {
		return undefined;
	}
	const { error, message } = body as ApiErrorBody;
	if (typeof message === "string" && message.length > 0) {
		return message;
	}
	return typeof error === "string" && error.length > 0 ? error : undefined;
}

export async function apiRequest<T>(
	input: RequestInfo | URL,
	errorMessage: string,
	options?: ApiRequestOptions
): Promise<T> {
	let init: RequestInit | undefined;
	if (options) {
		const { json, ...requestInit } = options;
		init = requestInit;
		if (json !== undefined) {
			const headers = new Headers(init.headers);
			headers.set("Content-Type", "application/json");
			init.headers = headers;
			init.body = JSON.stringify(json);
		}
	}

	const response = init ? await fetch(input, init) : await fetch(input);
	const body = (await response.json().catch(() => undefined)) as T | undefined;
	if (!response.ok) {
		const fallback = response.statusText ? `${errorMessage}: ${response.statusText}` : errorMessage;
		const error = Object.assign(new Error(getApiErrorMessage(body) ?? fallback), { status: response.status });
		throw error;
	}
	return body as T;
}
