import { auth } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';
import cron from 'node-cron';
import fs from 'node:fs/promises';
import { config } from '$lib/config';

// Schedule temp folder cleanup daily at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('[Cron] Starting daily temp folder cleanup...');
  try {
    await fs.rm(config.paths.temp, { recursive: true, force: true });
    await fs.mkdir(config.paths.temp, { recursive: true });
    console.log('[Cron] Temp folder cleaned successfully');
  } catch (e) {
    console.error('[Cron] Failed to clean temp folder:', e);
  }
});

export const handle: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({
    headers: event.request.headers,
  });

  event.locals.user = session?.user ?? null;
  event.locals.session = session?.session ?? null;

  // Protect app routes
  const isAppRoute = event.url.pathname.startsWith('/watch') ||
                     event.url.pathname.startsWith('/search') ||
                     event.url.pathname === '/';
  const isAuthRoute = event.url.pathname.startsWith('/login') ||
                      event.url.pathname.startsWith('/register');
  const isApiRoute = event.url.pathname.startsWith('/api');

  if (isAppRoute && !event.locals.user) {
    throw redirect(302, '/login');
  }

  // Redirect logged-in users away from auth pages
  if (isAuthRoute && event.locals.user) {
    throw redirect(302, '/');
  }

  return resolve(event);
};
