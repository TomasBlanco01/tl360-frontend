import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import { setUrl } from '../../tests/helpers';
import Verificar from './verificar/+page.svelte';

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
	post.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('página de verificación de correo (RF-01)', () => {
	it('con token en el enlace verifica la cuenta y lleva al login', async () => {
		setUrl('/auth/verificar?token=tok-123');
		post.mockResolvedValue({ message: 'Cuenta verificada correctamente.' });
		auth.login('t', { id: 1, nombre: 'Ana', email: 'ana@test.com', rol: 'cliente' });
		render(Verificar);

		await waitFor(() =>
			expect(post).toHaveBeenCalledWith('/auth/verificar-email', { token: 'tok-123' })
		);
		expect(await screen.findByText('Cuenta verificada correctamente.')).toBeInTheDocument();
		expect(auth.user?.email_verificado).toBe(true);
		await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
		expect(goto).toHaveBeenCalledWith('/auth/login');
	});

	it('si el token es inválido muestra el error y ofrece pedir otro', async () => {
		setUrl('/auth/verificar?token=vencido');
		post.mockRejectedValue(new ApiError(400, 'El enlace de verificación es inválido o venció'));
		render(Verificar);

		expect(
			await screen.findByText('El enlace de verificación es inválido o venció')
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Pedir un nuevo enlace' }));
		expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('sin token muestra el pendiente y permite reenviar el enlace', async () => {
		setUrl('/auth/verificar?email=ana@test.com');
		render(Verificar);

		expect(screen.getByText(/Te enviamos un correo/)).toBeInTheDocument();
		post.mockResolvedValue({
			message: 'Si el correo está pendiente, te enviamos un nuevo enlace.'
		});
		await userEvent.click(screen.getByRole('button', { name: 'Reenviar enlace' }));
		await waitFor(() =>
			expect(post).toHaveBeenCalledWith('/auth/reenviar-verificacion', {
				email: 'ana@test.com'
			})
		);
		expect(await screen.findByText(/Si el correo está pendiente/)).toBeInTheDocument();
	});

	it('en modo demo muestra el enlace de ejemplo cuando vuelve en la respuesta', async () => {
		setUrl('/auth/verificar');
		render(Verificar);

		post.mockResolvedValue({
			message: 'Si el correo está pendiente, te enviamos un nuevo enlace.',
			token_verificacion: 'demo-verificar-ana@test.com'
		});
		await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@test.com');
		await userEvent.click(screen.getByRole('button', { name: 'Reenviar enlace' }));
		const link = await screen.findByRole('link', { name: /ejemplo/ });
		expect(link).toHaveAttribute('href', '/auth/verificar?token=demo-verificar-ana%40test.com');
	});
});
