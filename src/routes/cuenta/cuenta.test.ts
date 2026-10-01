import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import { favoritos } from '$lib/stores/favoritos.svelte';
import { empresa } from '../../tests/helpers';
import Cuenta from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return {
		...real,
		api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
	};
});

const get = api.get as ReturnType<typeof vi.fn>;
const borrar = api.delete as ReturnType<typeof vi.fn>;

const ana = { id: 3, nombre: 'Ana Pérez', email: 'ana@test.com', rol: 'cliente' as const };
const turnos = [
	{
		id: 10,
		fecha: '2026-10-13',
		hora: '10:00:00',
		estado: 'confirmado',
		empresa_nombre: 'Peluquería Central'
	},
	{
		id: 11,
		fecha: '2026-10-14',
		hora: '16:30:00',
		estado: 'confirmado',
		empresa_nombre: 'Odontólogo Ruiz'
	}
];

function backend(mios = turnos) {
	get.mockImplementation(async (url: string) => {
		if (url === '/turnos/mis-turnos') return mios;
		const m = url.match(/^\/empresas\/(\d+)$/);
		if (m) return empresa({ id: Number(m[1]), nombre: `Favorito ${m[1]}` });
		return [];
	});
}

beforeEach(() => {
	get.mockReset();
	borrar.mockReset().mockResolvedValue({});
	auth.login('tok', ana);
	favoritos.ids = [];
	backend();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Mi cuenta', () => {
	it('sin sesión manda a iniciar sesión', async () => {
		auth.logout();
		render(Cuenta);
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/login'));
		expect(get).not.toHaveBeenCalledWith('/turnos/mis-turnos');
	});

	it('muestra los datos del usuario', async () => {
		render(Cuenta);
		expect(await screen.findByText('Ana Pérez · ana@test.com')).toBeInTheDocument();
	});

	it('lista los turnos con comercio y hora sin segundos', async () => {
		render(Cuenta);
		expect(await screen.findByText('Peluquería Central')).toBeInTheDocument();
		expect(screen.getByText('10:00 hs')).toBeInTheDocument();
		expect(screen.getByText('Odontólogo Ruiz')).toBeInTheDocument();
		expect(screen.getByText('16:30 hs')).toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: 'Cancelar Turno' })).toHaveLength(2);
	});

	it('sin turnos ofrece explorar comercios', async () => {
		backend([]);
		render(Cuenta);
		expect(await screen.findByText('No tenés turnos reservados')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Explorar comercios' })).toHaveAttribute(
			'href',
			'/comercios'
		);
	});

	describe('cancelar un turno', () => {
		it('si el usuario confirma, lo cancela y lo saca de la lista', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar Turno' })[0]);
			expect(borrar).toHaveBeenCalledWith('/turnos/cancelar/10');
			await vi.waitFor(() =>
				expect(screen.queryByText('Peluquería Central')).not.toBeInTheDocument()
			);
			expect(screen.getByText('Odontólogo Ruiz')).toBeInTheDocument();
		});

		it('si se arrepiente, no hace nada', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(false);
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar Turno' })[0]);
			expect(borrar).not.toHaveBeenCalled();
			expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		});

		it('si el backend lo rechaza (fuera de plazo), muestra el motivo y conserva el turno', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			const aviso = vi.spyOn(window, 'alert').mockImplementation(() => {});
			borrar.mockRejectedValue(
				new ApiError(400, 'Solo se puede cancelar un turno con al menos 2 horas de anticipación')
			);
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar Turno' })[0]);
			await vi.waitFor(() =>
				expect(aviso).toHaveBeenCalledWith(
					'Solo se puede cancelar un turno con al menos 2 horas de anticipación'
				)
			);
			expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		});

		it('ante un error inesperado muestra un mensaje genérico', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			const aviso = vi.spyOn(window, 'alert').mockImplementation(() => {});
			borrar.mockRejectedValue(new TypeError('Failed to fetch'));
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar Turno' })[0]);
			await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith('No se pudo cancelar el turno.'));
		});
	});

	describe('favoritos', () => {
		it('sin favoritos muestra el estado vacío', async () => {
			render(Cuenta);
			await userEvent.click(await screen.findByRole('button', { name: 'Favoritos' }));
			expect(await screen.findByText('Todavía no tenés favoritos')).toBeInTheDocument();
		});

		it('trae cada comercio favorito por su id (no todo el catálogo)', async () => {
			favoritos.ids = [7, 9];
			render(Cuenta);
			await userEvent.click(await screen.findByRole('button', { name: 'Favoritos' }));
			expect(await screen.findByText('Favorito 7')).toBeInTheDocument();
			expect(screen.getByText('Favorito 9')).toBeInTheDocument();
			expect(get).toHaveBeenCalledWith('/empresas/7');
			expect(get).toHaveBeenCalledWith('/empresas/9');
			expect(get).not.toHaveBeenCalledWith('/empresas');
		});
	});
});
