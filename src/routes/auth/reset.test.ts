import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { setUrl } from '../../tests/helpers';
import Reset from './reset/+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return {
		...real,
		api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
	};
});

const post = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
	post.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const completar = async (nueva: string, confirmar: string) => {
	await userEvent.type(screen.getByLabelText(/Nueva contraseña/), nueva);
	await userEvent.type(screen.getByLabelText(/Confirmar contraseña/), confirmar);
	await userEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
};

describe('página de nueva contraseña', () => {
	it('sin token en el enlace, invita a pedir uno nuevo', () => {
		setUrl('/auth/reset');
		render(Reset);
		expect(screen.getByText(/El enlace no es válido o expiró/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Solicitar enlace' })).toHaveAttribute(
			'href',
			'/auth/recuperar'
		);
		expect(screen.queryByLabelText(/Nueva contraseña/)).not.toBeInTheDocument();
	});

	it('exige al menos 6 caracteres', async () => {
		setUrl('/auth/reset?token=abc');
		render(Reset);
		await completar('123', '123');
		expect(await screen.findByText('Debe tener al menos 6 caracteres')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('exige que las dos contraseñas coincidan', async () => {
		setUrl('/auth/reset?token=abc');
		render(Reset);
		await completar('clave-nueva', 'clave-distinta');
		expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('manda el token del enlace con la contraseña nueva y va al login', async () => {
		setUrl('/auth/reset?token=tok-123');
		post.mockResolvedValue({ message: 'ok' });
		render(Reset);
		await completar('clave-nueva', 'clave-nueva');
		await waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/login'));
		expect(post).toHaveBeenCalledWith('/auth/reset-password', {
			token: 'tok-123',
			contraseña: 'clave-nueva'
		});
	});

	it('si el enlace venció, muestra el mensaje del backend', async () => {
		setUrl('/auth/reset?token=viejo');
		post.mockRejectedValue(new ApiError(400, 'El enlace de recuperación es inválido o venció'));
		render(Reset);
		await completar('clave-nueva', 'clave-nueva');
		expect(
			await screen.findByText('El enlace de recuperación es inválido o venció')
		).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});
