import { defineConfig, devices } from '@playwright/test';

const compatibilidad = /compatibilidad\.spec\.ts/;

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] },
			testMatch: compatibilidad
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] },
			testMatch: compatibilidad
		},
		{
			name: 'mobile-chrome',
			use: { ...devices['Pixel 7'] },
			testMatch: compatibilidad
		},
		{
			name: 'mobile-safari',
			use: { ...devices['iPhone 14'] },
			testMatch: compatibilidad
		}
	]
});
