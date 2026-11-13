import { expect, type Page, test } from '@playwright/test';

/**
 * P1-4 Login por rol + guards (modo mock: cualquier contraseña vale).
 * Cuentas: cliente@demo.com, negocio@demo.com (admin), admin@demo.com (superadmin).
 */
// Cada rol entra a su pantalla: el cliente a la portada, el dueño a /negocio y el superadmin a /admin.
async function loginComo(page: Page, email: string, destino = '/') {
	await page.goto('/auth/login');
	await page.getByLabel(/Correo/).fill(email);
	await page.getByLabel(/Contraseña/).fill('cualquiera');
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await page.waitForURL(destino);
}

test('un correo desconocido no inicia sesión', async ({ page }) => {
	await page.goto('/auth/login');
	await page.getByLabel(/Correo/).fill('nadie@demo.com');
	await page.getByLabel(/Contraseña/).fill('cualquiera');
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible();
});

test('sin sesión, /cuenta manda al login', async ({ page }) => {
	await page.goto('/cuenta');
	await page.waitForURL('/auth/login');
	await expect(page.getByRole('heading', { name: 'Iniciar Sesión' })).toBeVisible();
});

test('cliente entra a /cuenta pero no a /admin', async ({ page }) => {
	await loginComo(page, 'cliente@demo.com');
	await page.goto('/cuenta');
	await expect(page.getByRole('heading', { name: 'Mi Cuenta' })).toBeVisible();

	await page.goto('/admin');
	await page.waitForURL('/');
});

test('negocio entra a /negocio', async ({ page }) => {
	await loginComo(page, 'negocio@demo.com', '/negocio');
	await expect(page.getByRole('button', { name: 'Mis turnos' })).toBeVisible();
});

test('superadmin entra a /admin y Mi Negocio lo devuelve a su panel', async ({ page }) => {
	await loginComo(page, 'admin@demo.com', '/admin');
	await expect(page.getByRole('button', { name: /pendientes de verificación/i })).toBeVisible();
	await page.goto('/negocio');
	await page.waitForURL('/admin');
});
