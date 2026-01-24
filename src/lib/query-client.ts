import { QueryClient } from '@tanstack/svelte-query';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30 * 60 * 1000, // 30 minutes - data stays fresh longer
			gcTime: 60 * 60 * 1000, // 60 minutes - keep in memory for 1 hour
			retry: (failureCount, error) => {
				// Don't retry on 4xx errors
				if (error && typeof error === 'object' && 'status' in error) {
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
