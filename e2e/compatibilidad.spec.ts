import { expect, test } from '@playwright/test';

test.describe('compatibilidad RNF-06', () => {
	test('portada, directorio, ficha y login renderizan', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: /Trenque Lauquen/i })).toBeVisible();

		await page.goto('/comercios');
		await expect(page.getByRole('heading', { name: 'Comercios', exact: true })).toBeVisible();

		await page.goto('/comercios/1');
		await expect(page.locator('h1')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText('No encontramos ese comercio')).toHaveCount(0);

		await page.goto('/auth/login');
		await expect(page.getByRole('button', { name: 'Iniciar Sesión' })).toBeVisible();
	});
});
