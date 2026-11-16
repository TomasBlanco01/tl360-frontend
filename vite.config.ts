import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Runtime fijo: adapter-vercel 6 rechaza versiones de Node que no conoce (Vercel ya usa una más nueva).
			adapter: adapter({ runtime: 'nodejs24.x' })
		}),
		svelteTesting()
	],
	// Solo desarrollo: Vite escanea todas las pantallas al arrancar. Si no, la primera vez que se
	// abre una página con una dependencia nueva (íconos, leaflet) re-optimiza y recarga la página.
	optimizeDeps: {
		entries: ['src/**/*.svelte', 'src/**/*.ts', '!src/**/*.test.ts']
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		setupFiles: ['src/tests/setup.ts'],
		clearMocks: true,
		coverage: {
			provider: 'v8',
			include: ['src/lib/**', 'src/routes/**'],
			exclude: ['src/**/*.test.ts', 'src/tests/**', 'src/lib/mock/data.ts', 'src/lib/assets/**'],
			reporter: ['text-summary', 'html']
		}
	}
});
