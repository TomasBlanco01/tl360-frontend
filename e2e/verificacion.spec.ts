import { expect, test } from '@playwright/test';

/**
 * P1-4 Solicitar verificación comercial con CUIT (modo mock).
 * CUIT válido según módulo 11: 20123456786.
 */
test('el dueño solicita verificación con CUIT y constancia', async ({ page }) => {
	await page.goto('/auth/login');
	await page.getByLabel(/Correo/).fill('negocio@demo.com');
	await page.getByLabel(/Contraseña/).fill('cualquiera');
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await page.waitForURL('/');

	await page.goto('/negocio');
	await page.getByRole('tab', { name: 'Mi Ficha' }).click();
	await page.getByLabel(/CUIT \(11 dígitos\)/).fill('20123456786');
	await page.getByLabel(/Constancia de CUIT/).fill('https://ejemplo.com/constancia.pdf');
	await page.getByRole('button', { name: /Solicitar verificación|Reenviar solicitud/ }).click();
	await expect(page.getByText('Solicitud de verificación enviada')).toBeVisible({
		timeout: 15_000
	});
});
