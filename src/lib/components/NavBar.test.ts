import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { auth } from '$lib/stores/auth.svelte';
import type { Usuario } from '$lib/types';
import NavBar from './NavBar.svelte';

const usuario = (rol: string): Usuario =>
	({ id: 1, nombre: 'Ana', email: 'ana@test.com', rol, email_verificado: true }) as Usuario;

const enlaces = () => screen.getAllByRole('link').map((a) => a.textContent?.trim());

describe('barra de navegación', () => {
	afterEach(() => auth.logout());

	it('cualquiera ve el acceso a eventos y colectas', () => {
		render(NavBar);
		expect(screen.getByRole('link', { name: 'Eventos y colectas' })).toHaveAttribute(
			'href',
			'/publicitar'
		);
	});

	it('el dueño de comercio tiene todo en Mi Negocio (sin Mi Cuenta aparte)', () => {
		auth.login('t', usuario('admin'));
		render(NavBar);
		expect(enlaces()).toContain('Mi Negocio');
		expect(enlaces()).not.toContain('Mi Cuenta');
	});

	it('el cliente ve Mi Cuenta y no Mi Negocio', () => {
		auth.login('t', usuario('cliente'));
		render(NavBar);
		expect(enlaces()).toContain('Mi Cuenta');
		expect(enlaces()).not.toContain('Mi Negocio');
	});

	it('el superadmin ve Admin y no el canal público de difusiones', () => {
		auth.login('t', usuario('superadmin'));
		render(NavBar);
		expect(enlaces()).toContain('Admin');
		expect(enlaces()).not.toContain('Eventos y colectas');
	});
});
