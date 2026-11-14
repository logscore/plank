import { QueryClient } from "@tanstack/svelte-query";
import { UPLOAD_CHUNK_BYTES } from "$lib/utils";

interface ApiErrorBody {
	error?: string;
	message?: string;
}

type ApiRequestOptions = RequestInit & { json?: unknown };

export const queryClient = new QueryClient({
	defaultOptions: {
		mutations: {
			retry: 1,
		},
		queries: {
			gcTime: 60 * 60 * 1000,
			refetchOnReconnect: true,
			refetchOnWindowFocus: false,
			retry: (failureCount, error) => {
				if (error && typeof error === "object" && "status" in error) {
					const status = error.status as number;
					if (status >= 400 && status < 500) {
						return false;
					}
				}
				return failureCount < 3;
			},
			staleTime: 30 * 60 * 1000,
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

/** Send a file in chunks with PUT. Each chunk starts where the server says its copy ends. */
export async function uploadInChunks(
	path: string,
	file: File,
	errorMessage: string,
	onProgress?: (progress: number) => void,
	query: Record<string, string> = {}
): Promise<void> {
	if (file.size === 0) {
		throw new Error("The file is empty");
	}
	// Each chunk moves forward, and one server reset costs at most one more pass.
	const requestCountMax = Math.ceil(file.size / UPLOAD_CHUNK_BYTES) * 2;
	let received = 0;
	for (let requestCount = 0; received < file.size; requestCount += 1) {
		if (requestCount >= requestCountMax) {
			throw new Error(`${errorMessage}: upload stopped making progress`);
		}
		const params = new URLSearchParams({
			...query,
			name: file.name,
			offset: String(received),
			size: String(file.size),
		});
		// biome-ignore lint/performance/noAwaitInLoops: chunks must arrive in order
		({ received } = await apiRequest<{ received: number }>(`${path}?${params}`, errorMessage, {
			body: file.slice(received, received + UPLOAD_CHUNK_BYTES),
			// SvelteKit drops a request body that has no content type.
			headers: { "Content-Type": "application/octet-stream" },
			method: "PUT",
		}));
		onProgress?.(received / file.size);
	}
}
