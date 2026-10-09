import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import { favoritos } from '$lib/stores/favoritos.svelte';
import type { MiTurno } from '$lib/types';
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

function backend(mios: MiTurno[] = turnos) {
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
		// 2.2 La confirmación es un modal accesible (ConfirmModal), no window.confirm().
		async function abrirModal() {
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar Turno' })[0]);
			expect(await screen.findByText('Cancelar turno')).toBeInTheDocument();
		}

		it('si el usuario confirma, lo cancela y lo saca de la lista', async () => {
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
			expect(borrar).toHaveBeenCalledWith('/turnos/cancelar/10');
			await vi.waitFor(() =>
				expect(screen.queryByText('Peluquería Central')).not.toBeInTheDocument()
			);
			expect(screen.getByText('Odontólogo Ruiz')).toBeInTheDocument();
		});

		it('si se arrepiente, no hace nada', async () => {
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
			expect(borrar).not.toHaveBeenCalled();
			expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		});

		it('si el backend lo rechaza (fuera de plazo), muestra el motivo y conserva el turno', async () => {
			borrar.mockRejectedValue(
				new ApiError(400, 'Solo se puede cancelar un turno con al menos 2 horas de anticipación')
			);
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
			await vi.waitFor(() =>
				expect(
					screen.getByText('Solo se puede cancelar un turno con al menos 2 horas de anticipación')
				).toBeInTheDocument()
			);
			expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		});

		it('ante un error inesperado muestra un mensaje genérico', async () => {
			borrar.mockRejectedValue(new TypeError('Failed to fetch'));
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
			await vi.waitFor(() =>
				expect(screen.getByText('No se pudo cancelar el turno.')).toBeInTheDocument()
			);
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

	describe('historial (2.6)', () => {
		it('separa próximos y pasados y el nombre enlaza a la ficha', async () => {
			backend([
				{
					id: 10,
					fecha: '2026-10-13',
					hora: '10:00:00',
					estado: 'confirmado',
					empresa_nombre: 'Futura',
					empresa_id: 5,
					empresa_slug: 'futura'
				},
				{
					id: 11,
					fecha: '2020-01-01',
					hora: '10:00:00',
					estado: 'confirmado',
					empresa_nombre: 'Vieja',
					empresa_id: 6
				}
			]);
			render(Cuenta);
			await screen.findByText('Futura');
			expect(screen.queryByText('Vieja')).not.toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Futura' })).toHaveAttribute(
				'href',
				'/comercios/futura'
			);
			await userEvent.click(screen.getByRole('button', { name: /Turnos pasados/ }));
			expect(await screen.findByText('Vieja')).toBeInTheDocument();
			expect(screen.queryByText('Futura')).not.toBeInTheDocument();
		});
	});
});
