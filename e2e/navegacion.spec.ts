import { expect, test } from '@playwright/test';

/** P1-4 Redirect del alias viejo + 404 amigable (modo mock). */
test('/mapa redirige al directorio unificado en vista mapa', async ({ page }) => {
	await page.goto('/mapa?categoria_id=1');
	await expect(page).toHaveURL(/\/comercios\?[^]*vista=mapa/);
	await expect(page.getByRole('tab', { name: /Mapa/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
});

test('una ficha inexistente muestra el 404 amigable', async ({ page }) => {
	await page.goto('/comercios/ficha-que-no-existe-xyz');
	await expect(page.getByText('No encontramos ese comercio')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole('link', { name: 'Ver directorio' })).toHaveAttribute(
		'href',
		'/comercios'
	);
});
