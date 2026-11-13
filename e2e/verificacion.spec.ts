import { expect, test } from '@playwright/test';

/**
 * P1-4 Solicitar verificación comercial con CUIT (modo mock).
 * CUIT válido según módulo 11: 20123456786.
 * Se usa la dueña de "Belleza Alsina" (empresa 8, sin solicitud previa): negocio@demo.com
 * ya administra un comercio verificado y por eso no muestra el botón.
 */
test('el dueño solicita verificación con CUIT y constancia', async ({ page }) => {
	await page.goto('/auth/login');
	await page.getByLabel(/Correo/).fill('duenio108@demo.com');
	await page.getByLabel(/Contraseña/).fill('cualquiera');
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	// El dueño entra directo a Mi Negocio (Mis turnos); la ficha es una solapa de configuración.
	await page.waitForURL('/negocio');
	await page.getByRole('button', { name: 'Mi ficha' }).click();
	await page.getByLabel(/CUIT \(11 dígitos\)/).fill('20123456786');
	await page.getByLabel(/Constancia de CUIT/).fill('https://ejemplo.com/constancia.pdf');
	await page.getByRole('button', { name: /Solicitar verificación|Reenviar solicitud/ }).click();
	await expect(page.getByText('Solicitud de verificación enviada')).toBeVisible({
		timeout: 15_000
	});
});
