import fs from "node:fs/promises";
import cron from "node-cron";
import { config } from "$lib/config";
import { hasActiveDownloads } from "./torrent";

// Schedule temp folder cleanup daily at midnight
export function tempFolderCleanupJob() {
	cron.schedule("0 0 * * *", async () => {
		console.log("[Cron] Starting daily temp folder cleanup...");
		try {
			if (hasActiveDownloads()) {
				console.log("[Cron] Skipping temp cleanup because downloads are still active");
				return;
			}
			await fs.rm(config.paths.temp, { recursive: true, force: true });
			await fs.mkdir(config.paths.temp, { recursive: true });
			console.log("[Cron] Temp folder cleaned successfully");
		} catch (e) {
			console.error("[Cron] Failed to clean temp folder:", e);
		}
	});
}
