import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.{test,spec}.{js,ts}'],
    environment: 'node',
    globals: true,
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
    },
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
    },
  },
});
