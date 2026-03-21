import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [svelte({ hot: false })],
	resolve: {
		conditions: ['browser'],
		alias: {
			$lib: path.resolve(__dirname, './src/lib'),
			$app: path.resolve(__dirname, './tests/__mocks__/$app')
		}
	},
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['tests/**/*.test.{js,ts}'],
		passWithNoTests: true,
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.{ts,js,svelte}'],
			exclude: [
				'src/lib/assets/**',
				'src/lib/i18n/**',
				'src/lib/types/**'
			],
			reporter: ['text', 'json-summary'],
			reportsDirectory: './coverage'
		}
	}
});
