import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: '0.0.0.0',
		port: Number.parseInt(process.env.PORT || '3300', 10),
	},
	build: {
		rollupOptions: {
			external: ['webtorrent'],
		},
	},
	ssr: {
		external: ['webtorrent'],
	},
});
