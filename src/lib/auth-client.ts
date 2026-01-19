import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
  // In production (same-origin), no baseURL needed
  // In dev, VITE_AUTH_URL can be set if needed
  ...(import.meta.env.VITE_AUTH_URL ? { baseURL: import.meta.env.VITE_AUTH_URL } : {}),
});
