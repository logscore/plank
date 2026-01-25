import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		include: ['src/tests/**/*.{test,spec}.{js,ts}'],
		environment: 'node',
		globals: true,
		setupFiles: ['src/tests/setup.ts'],
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
		},
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
		},
	},
});
