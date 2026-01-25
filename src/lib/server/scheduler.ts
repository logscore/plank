import fs from 'node:fs/promises';
import cron from 'node-cron';
import { config } from '$lib/config';
import { transcodeLibrary } from './transcoder';

export function transcodeScheduler() {
	// Run every day at midnight (0 0 * * *)
	cron.schedule('0 0 * * *', async () => {
		console.log('[Scheduler] Starting nightly library transcoding...');
		try {
			await transcodeLibrary();
			console.log('[Scheduler] Nightly transcoding completed.');
		} catch (e) {
			console.error('[Scheduler] Nightly transcoding failed:', e);
		}
	});
}

// Schedule temp folder cleanup daily at midnight
export function tempFolderScheduler() {
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
}
