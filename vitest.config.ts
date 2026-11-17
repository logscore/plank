import path from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	resolve: {
		alias: {
			$lib: path.resolve(import.meta.dirname, "./src/lib"),
		},
	},
	test: {
		alias: {
			$lib: path.resolve(import.meta.dirname, "./src/lib"),
		},
		environment: "node",
		globals: true,
		include: ["src/tests/**/*.{test,spec}.{js,ts}"],
		setupFiles: ["src/tests/setup.ts"],
	},
});
