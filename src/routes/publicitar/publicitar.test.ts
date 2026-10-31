import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { ApiError, api } from '$lib/api';
import Page from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const post = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
	post.mockReset().mockResolvedValue({ message: 'ok' });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const MENSAJE = 'Juntamos alimentos para el comedor del barrio.';

async function llenar(mensaje = MENSAJE) {
	await userEvent.type(screen.getByLabelText(/Nombre o institución/), 'Comisión del barrio');
	await userEvent.type(screen.getByLabelText(/Email o teléfono/), 'vecinos@demo.com');
	await userEvent.selectOptions(screen.getByLabelText(/Qué querés difundir/), 'colecta');
	await userEvent.type(screen.getByLabelText(/Contanos de qué se trata/), mensaje);
}

describe('canal público de difusión (RF-06)', () => {
	it('envía la solicitud sin sesión y confirma la recepción', async () => {
		render(Page);
		await llenar();
		await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/solicitudes-publicidad', {
				nombre: 'Comisión del barrio',
				contacto: 'vecinos@demo.com',
				tipo: 'colecta',
				mensaje: MENSAJE
			})
		);
		expect(await screen.findByText('¡Recibimos tu solicitud!')).toBeInTheDocument();
	});

	it('pide un mensaje un poco más largo antes de llamar a la API', async () => {
		render(Page);
		await llenar('corto');
		await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('mínimo 10');
		expect(post).not.toHaveBeenCalled();
	});

	it('muestra el aviso del backend si el contacto ya tiene una pendiente', async () => {
		post.mockRejectedValue(
			new ApiError(409, 'Ya recibimos una solicitud con este contacto y está pendiente')
		);
		render(Page);
		await llenar();
		await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Ya recibimos una solicitud');
	});
});
