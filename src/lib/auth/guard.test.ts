import { beforeEach, describe, expect, it } from 'vitest';
import { auth } from '$lib/stores/auth.svelte';
import { evaluarAcceso } from './guard';

const cliente = { id: 1, nombre: 'Ana', email: 'a@b.com', rol: 'cliente' as const };
const admin = { id: 2, nombre: 'Due', email: 'd@b.com', rol: 'admin' as const };
const superadmin = { id: 3, nombre: 'Root', email: 'r@b.com', rol: 'superadmin' as const };

beforeEach(() => auth.logout());

describe('evaluarAcceso', () => {
	it('sin sesión pide login en todos los niveles', () => {
		expect(evaluarAcceso('auth')).toBe('/auth/login');
		expect(evaluarAcceso('admin')).toBe('/auth/login');
		expect(evaluarAcceso('superadmin')).toBe('/auth/login');
	});

	it('cliente entra a auth pero no a admin ni superadmin', () => {
		auth.login('t', cliente);
		expect(evaluarAcceso('auth')).toBeNull();
		expect(evaluarAcceso('admin')).toBe('/');
		expect(evaluarAcceso('superadmin')).toBe('/');
	});

	it('admin entra a admin pero no a superadmin', () => {
		auth.login('t', admin);
		expect(evaluarAcceso('admin')).toBeNull();
		expect(evaluarAcceso('superadmin')).toBe('/');
	});

	it('superadmin entra a todo', () => {
		auth.login('t', superadmin);
		expect(evaluarAcceso('admin')).toBeNull();
		expect(evaluarAcceso('superadmin')).toBeNull();
	});
});
