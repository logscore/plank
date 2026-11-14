import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
	},
	preprocess: vitePreprocess(),
	server: {
		allowedHosts: ["localhost", ".test"],
	},
};

export default config;
