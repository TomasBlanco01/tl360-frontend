import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import { empresa } from '../../../../tests/helpers';
import Reservar from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;

const MARTES = '2026-10-13'; // 2026-10-12 es lunes
const DOMINGO = '2026-10-18';

interface Config {
	comercio?: Record<string, unknown>;
	horarios?: Record<string, string[]>;
	ocupados?: { hora: string }[];
}

function backend({
	comercio = {},
	horarios = { Martes: ['09:00-10:00', '16:00-17:00'] },
	ocupados = []
}: Config = {}) {
	get.mockImplementation(async (url: string) => {
		if (url === '/empresas/2700')
			return empresa({
				id: 2700,
				nombre: 'CRIA Centro',
				duracion_turno_min: 30,
				turnos_habilitados: true,
				...comercio
			});
		if (url === '/empresas/horarios/2700') return horarios;
		if (url.startsWith('/turnos/ocupados')) return ocupados;
		return [];
	});
}

async function elegirFecha(fecha: string) {
	const campo = (await screen.findByLabelText(/Elegí una fecha/)) as HTMLInputElement;
	await fireEvent.input(campo, { target: { value: fecha } });
	await fireEvent.change(campo);
}

const horas = () =>
	screen
		.queryAllByRole('button')
		.map((b) => b.textContent!.trim())
		.filter((t) => /^\d{2}:\d{2}$/.test(t));

beforeEach(() => {
	get.mockReset();
	post.mockReset();
	(page as { params: Record<string, string> }).params = { id: '2700' };
	auth.login('tok', { id: 3, nombre: 'Ana', email: 'ana@test.com', rol: 'cliente' });
	backend();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reservar turno', () => {
	it('sin sesión manda a iniciar sesión', async () => {
		auth.logout();
		render(Reservar);
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/login'));
	});

	it('muestra el nombre del comercio', async () => {
		render(Reservar);
		expect(await screen.findByText('CRIA Centro')).toBeInTheDocument();
	});

	it('si el comercio no toma turnos online, vuelve a su ficha', async () => {
		backend({ comercio: { turnos_habilitados: false } });
		render(Reservar);
		await vi.waitFor(() =>
			expect(goto).toHaveBeenCalledWith('/comercios/2700', { replaceState: true })
		);
	});

	it('antes de elegir fecha no muestra horarios', async () => {
		render(Reservar);
		await screen.findByText('CRIA Centro');
		expect(horas()).toEqual([]);
	});

	it('ofrece los horarios de la grilla del día, franja por franja', async () => {
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await vi.waitFor(() => expect(horas()).toEqual(['09:00', '09:30', '16:00', '16:30']));
	});

	it('la grilla usa la duración del turno del comercio', async () => {
		backend({ comercio: { duracion_turno_min: 15 }, horarios: { Martes: ['09:00-10:00'] } });
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await vi.waitFor(() => expect(horas()).toEqual(['09:00', '09:15', '09:30', '09:45']));
	});

	it('un día sin horarios avisa que no hay turnos', async () => {
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(DOMINGO);
		expect(await screen.findByText('No hay turnos disponibles para este día.')).toBeInTheDocument();
		expect(horas()).toEqual([]);
	});

	it('pide al backend los horarios ocupados de esa fecha y los deshabilita', async () => {
		backend({ ocupados: [{ hora: '09:30' }] });
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await vi.waitFor(() => expect(screen.getByRole('button', { name: '09:30' })).toBeDisabled());
		expect(get).toHaveBeenCalledWith(`/turnos/ocupados?empresa_id=2700&fecha=${MARTES}`);
		expect(screen.getByRole('button', { name: '09:00' })).toBeEnabled();
	});

	it('elegir un horario pide confirmar la reserva', async () => {
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await userEvent.click(await screen.findByRole('button', { name: '16:00' }));
		expect(await screen.findByText('Vas a reservar:')).toBeInTheDocument();
		expect(screen.getByText(/16:00 hs/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeInTheDocument();
	});

	it('confirmar manda la reserva al backend y muestra el éxito', async () => {
		post.mockResolvedValue({ message: 'Turno reservado correctamente' });
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await userEvent.click(await screen.findByRole('button', { name: '09:00' }));
		await userEvent.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));

		expect(await screen.findByText('¡Turno reservado!')).toBeInTheDocument();
		expect(post).toHaveBeenCalledWith('/turnos/reservar', {
			empresa_id: 2700,
			fecha: MARTES,
			hora: '09:00'
		});
		expect(screen.getByRole('link', { name: 'Ver mis turnos' })).toHaveAttribute('href', '/cuenta');
	});

	it('si otro cliente se quedó con el horario (409), muestra el aviso y permite elegir otro', async () => {
		post.mockRejectedValue(new ApiError(409, 'Turno ya ocupado'));
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await userEvent.click(await screen.findByRole('button', { name: '09:00' }));
		await userEvent.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));

		expect(await screen.findByText('Turno ya ocupado')).toBeInTheDocument();
		expect(screen.queryByText('¡Turno reservado!')).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Elegir otro horario' }));
		expect(screen.queryByText('Vas a reservar:')).not.toBeInTheDocument();
	});

	it('muestra el motivo si el backend rechaza el horario', async () => {
		post.mockRejectedValue(
			new ApiError(
				400,
				'Ese horario no está disponible: elegí uno de los horarios de atención del comercio'
			)
		);
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await userEvent.click(await screen.findByRole('button', { name: '09:00' }));
		await userEvent.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));
		expect(await screen.findByText(/Ese horario no está disponible/)).toBeInTheDocument();
	});

	it('un error inesperado muestra un mensaje genérico', async () => {
		post.mockRejectedValue(new TypeError('Failed to fetch'));
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await userEvent.click(await screen.findByRole('button', { name: '09:00' }));
		await userEvent.click(await screen.findByRole('button', { name: 'Confirmar reserva' }));
		expect(await screen.findByText('No se pudo reservar el turno.')).toBeInTheDocument();
	});

	it('cambiar de fecha descarta el horario elegido', async () => {
		render(Reservar);
		await screen.findByText('CRIA Centro');
		await elegirFecha(MARTES);
		await userEvent.click(await screen.findByRole('button', { name: '09:00' }));
		expect(await screen.findByText('Vas a reservar:')).toBeInTheDocument();
		await elegirFecha('2026-10-20');
		await vi.waitFor(() =>
			expect(screen.getByRole('button', { name: '09:00' }).className).not.toContain('bg-brand-500')
		);
	});
});
