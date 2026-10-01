import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import Login from './login/+page.svelte';
import Register from './register/+page.svelte';
import Recuperar from './recuperar/+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return {
		...real,
		api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
	};
});

const post = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
	auth.logout();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const escribir = async (campo: string | RegExp, texto: string) =>
	userEvent.type(screen.getByLabelText(campo), texto);

describe('página de login', () => {
	it('con campos vacíos muestra los errores y no llama a la API', async () => {
		render(Login);
		await userEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
		expect(await screen.findAllByText('Este campo es obligatorio')).toHaveLength(2);
		expect(post).not.toHaveBeenCalled();
	});

	it('rechaza un correo con formato inválido', async () => {
		render(Login);
		await escribir(/Correo/, 'no-es-correo');
		await escribir(/Contraseña/, 'clave123');
		await userEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
		expect(await screen.findByText('Ingresá un correo electrónico válido')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('un login correcto guarda la sesión y va al inicio', async () => {
		const user = { id: 3, nombre: 'Ana', email: 'ana@test.com', rol: 'cliente' };
		post.mockResolvedValue({ message: 'ok', token: 'tok-abc', user });
		render(Login);
		await escribir(/Correo/, 'ana@test.com');
		await escribir(/Contraseña/, 'clave123');
		await userEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
		expect(post).toHaveBeenCalledWith('/auth/login', {
			email: 'ana@test.com',
			contraseña: 'clave123'
		});
		expect(auth.token).toBe('tok-abc');
		expect(auth.user).toEqual(user);
	});

	it('muestra el mensaje del backend si las credenciales son incorrectas', async () => {
		post.mockRejectedValue(new ApiError(401, 'Correo o contraseña incorrectos'));
		render(Login);
		await escribir(/Correo/, 'ana@test.com');
		await escribir(/Contraseña/, 'mala');
		await userEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
		expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument();
		expect(auth.token).toBeNull();
		expect(goto).not.toHaveBeenCalled();
	});

	it('muestra el aviso de demasiados intentos (429)', async () => {
		post.mockRejectedValue(new ApiError(429, 'Demasiados intentos. Probá de nuevo en 14 minutos.'));
		render(Login);
		await escribir(/Correo/, 'ana@test.com');
		await escribir(/Contraseña/, 'mala');
		await userEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
		expect(await screen.findByText(/Demasiados intentos/)).toBeInTheDocument();
	});

	it('un error inesperado muestra un mensaje genérico', async () => {
		post.mockRejectedValue(new TypeError('Failed to fetch'));
		render(Login);
		await escribir(/Correo/, 'ana@test.com');
		await escribir(/Contraseña/, 'clave123');
		await userEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
		expect(
			await screen.findByText('Credenciales inválidas o error en el servidor')
		).toBeInTheDocument();
	});

	it('enlaza a recuperar contraseña y a registrarse', () => {
		render(Login);
		expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
			'href',
			'/auth/recuperar'
		);
		expect(screen.getByRole('link', { name: 'Registrate aquí' })).toHaveAttribute(
			'href',
			'/auth/register'
		);
	});
});

describe('página de registro', () => {
	it('valida nombre, correo y una contraseña de al menos 6 caracteres', async () => {
		render(Register);
		await escribir(/Correo/, 'mal');
		await escribir(/Contraseña/, '123');
		await userEvent.click(screen.getByRole('button', { name: /Registr|Crear/ }));
		expect(await screen.findByText('Ingresá un correo electrónico válido')).toBeInTheDocument();
		expect(screen.getByText('Debe tener al menos 6 caracteres')).toBeInTheDocument();
		expect(screen.getByText('Este campo es obligatorio')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('un registro correcto manda los datos y lleva al login', async () => {
		post.mockResolvedValue({});
		render(Register);
		await escribir(/Nombre/, 'Ana Pérez');
		await escribir(/Correo/, 'ana@test.com');
		await escribir(/Contraseña/, 'clave123');
		await userEvent.click(screen.getByRole('button', { name: /Registr|Crear/ }));
		await waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/login'));
		expect(post).toHaveBeenCalledWith('/auth/register', {
			nombre: 'Ana Pérez',
			email: 'ana@test.com',
			contraseña: 'clave123'
		});
	});

	it('muestra el error del backend (correo ya registrado)', async () => {
		post.mockRejectedValue(new ApiError(400, 'El correo ya está registrado'));
		render(Register);
		await escribir(/Nombre/, 'Ana');
		await escribir(/Correo/, 'ana@test.com');
		await escribir(/Contraseña/, 'clave123');
		await userEvent.click(screen.getByRole('button', { name: /Registr|Crear/ }));
		expect(await screen.findByText('El correo ya está registrado')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});

describe('página de recuperar contraseña', () => {
	it('pide un correo válido', async () => {
		render(Recuperar);
		await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
		expect(await screen.findByText('Este campo es obligatorio')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('tras enviar, confirma sin revelar si el correo existe', async () => {
		post.mockResolvedValue({ message: 'ok' });
		render(Recuperar);
		await escribir(/Correo/, 'ana@test.com');
		await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
		expect(await screen.findByText('Revisá tu correo')).toBeInTheDocument();
		expect(post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'ana@test.com' });
		expect(screen.getByText(/Si el correo/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute(
			'href',
			'/auth/login'
		);
	});

	it('si el límite de pedidos se supera, muestra el mensaje del backend', async () => {
		post.mockRejectedValue(new ApiError(429, 'Demasiados intentos. Probá de nuevo en 1 hora.'));
		render(Recuperar);
		await escribir(/Correo/, 'ana@test.com');
		await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
		expect(await screen.findByText(/Demasiados intentos/)).toBeInTheDocument();
		expect(screen.queryByText('Revisá tu correo')).not.toBeInTheDocument();
	});
});
