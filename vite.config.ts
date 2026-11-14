import path from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		rollupOptions: {
			external: ["webtorrent"],
		},
	},
	plugins: [tailwindcss(), sveltekit()],
	server: {
		allowedHosts: ["localhost", "127.0.0.1"],
		host: "0.0.0.0",
		port: Number.parseInt(process.env.PORT || "3300", 10),
		watch: {
			ignored: ["**/db/**", `${path.resolve("data")}/**`],
		},
	},
	ssr: {
		external: ["webtorrent"],
		noExternal: ["vidstack"],
	},
});
