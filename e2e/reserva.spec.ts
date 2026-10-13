import { expect, type Page, test } from '@playwright/test';

/**
 * P1-4 Reservar → cancelar → slot liberado (modo mock, empresa 1 con turnos).
 * El estado en memoria vive en la pestaña: todo el flujo va en un solo test.
 */

// Próximo lunes no-pasado en formato yyyy-mm-dd (la peluquería atiende Lun-Sáb).
function proximoLunes(): string {
	const d = new Date();
	d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + 7);
	return d.toISOString().slice(0, 10);
}

async function loginCliente(page: Page) {
	await page.goto('/auth/login');
	await page.getByLabel(/Correo/).fill('cliente@demo.com');
	await page.getByLabel(/Contraseña/).fill('cualquiera');
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await page.waitForURL('/');
}

test('reservar, cancelar y ver el slot libre de nuevo', async ({ page }) => {
	await loginCliente(page);
	const fecha = proximoLunes();

	// 1. Reservar.
	await page.goto('/comercios/1/reservar');
	await page.locator('input[type="date"]').fill(fecha);
	const slotLibre = page.locator('.grid button:not([disabled])').first();
	await expect(slotLibre).toBeVisible({ timeout: 15_000 });
	const hora = (await slotLibre.textContent()) ?? '';
	expect(hora).toMatch(/\d\d:\d\d/);
	await slotLibre.click();
	await page.getByRole('button', { name: 'Confirmar reserva' }).click();
	await expect(page.getByText('¡Turno reservado!')).toBeVisible({ timeout: 15_000 });

	// 2. El turno aparece en /cuenta.
	await page.goto('/cuenta');
	await expect(page.getByText('Estilo Urbano Peluquería').first()).toBeVisible({
		timeout: 15_000
	});

	// 3. Cancelar con el modal (sin confirms nativos).
	await page.getByRole('button', { name: 'Cancelar Turno' }).first().click();
	await page.getByRole('button', { name: 'Sí, cancelar' }).click();
	await expect(page.getByText('Turno cancelado')).toBeVisible({ timeout: 15_000 });

	// 4. El slot quedó libre de nuevo en la grilla.
	await page.goto('/comercios/1/reservar');
	await page.locator('input[type="date"]').fill(fecha);
	const mismoSlot = page.locator('.grid button', { hasText: hora.trim() });
	await expect(mismoSlot).toBeVisible({ timeout: 15_000 });
	await expect(mismoSlot).toBeEnabled();
});
