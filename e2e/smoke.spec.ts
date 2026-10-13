import { expect, test } from '@playwright/test';

/**
 * Smoke del directorio público (modo mock). Requiere `npm run preview`
 * (o dev) sirviendo la app antes de `npm run test:e2e`.
 */
test('portada y directorio cargan', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /Trenque Lauquen/i })).toBeVisible();

	await page.goto('/comercios');
	await expect(page.getByRole('heading', { name: 'Comercios' })).toBeVisible();
});

test('vista mapa retiene la ruta', async ({ page }) => {
	await page.goto('/comercios?vista=mapa');
	await expect(page.getByRole('tab', { name: /Mapa/ })).toHaveAttribute('aria-selected', 'true');
});
