import fs from "node:fs/promises";
import cron from "node-cron";
import { PATHS } from "./paths";
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
			await fs.rm(PATHS.temp, { recursive: true, force: true });
			await fs.mkdir(PATHS.temp, { recursive: true });
			console.log("[Cron] Temp folder cleaned successfully");
		} catch (e) {
			console.error("[Cron] Failed to clean temp folder:", e);
		}
	});
}
