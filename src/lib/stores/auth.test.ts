import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Usuario } from '$lib/types';

const ana: Usuario = { id: 3, nombre: 'Ana', email: 'ana@test.com', rol: 'cliente' };

async function cargar() {
	vi.resetModules();
	return (await import('./auth.svelte')).auth;
}

beforeEach(() => localStorage.clear());

describe('auth store', () => {
	it('arranca sin sesión', async () => {
		const auth = await cargar();
		expect(auth.user).toBeNull();
		expect(auth.token).toBeNull();
		expect(auth.isAdmin).toBe(false);
		expect(auth.isSuperAdmin).toBe(false);
	});

	it('login guarda la sesión en memoria y en localStorage', async () => {
		const auth = await cargar();
		auth.login('tok', ana);
		expect(auth.user).toEqual(ana);
		expect(auth.token).toBe('tok');
		expect(localStorage.getItem('token')).toBe('tok');
		expect(JSON.parse(localStorage.getItem('user')!)).toEqual(ana);
	});

	it('logout limpia todo', async () => {
		const auth = await cargar();
		auth.login('tok', ana);
		auth.logout();
		expect(auth.user).toBeNull();
		expect(auth.token).toBeNull();
		expect(localStorage.getItem('token')).toBeNull();
		expect(localStorage.getItem('user')).toBeNull();
	});

	it('recupera la sesión guardada al recargar la página', async () => {
		localStorage.setItem('token', 'guardado');
		localStorage.setItem('user', JSON.stringify(ana));
		const auth = await cargar();
		expect(auth.token).toBe('guardado');
		expect(auth.user).toEqual(ana);
	});

	it('un usuario guardado corrupto no rompe la app', async () => {
		localStorage.setItem('user', '{no-es-json');
		const auth = await cargar();
		expect(auth.user).toBeNull();
	});

	it('detecta los roles sin distinguir mayúsculas', async () => {
		const auth = await cargar();
		auth.login('t', { ...ana, rol: 'admin' });
		expect(auth.isAdmin).toBe(true);
		expect(auth.isSuperAdmin).toBe(false);
		auth.login('t', { ...ana, rol: 'SuperAdmin' as Usuario['rol'] });
		expect(auth.isSuperAdmin).toBe(true);
		expect(auth.isAdmin).toBe(false);
		auth.login('t', ana);
		expect(auth.isAdmin || auth.isSuperAdmin).toBe(false);
	});
});
