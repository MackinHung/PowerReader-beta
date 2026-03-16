import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
			$app: path.resolve(__dirname, './.svelte-kit/runtime/app')
		}
	},
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['tests/**/*.test.js']
	}
});
