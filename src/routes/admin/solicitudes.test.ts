import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import Admin from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const get = api.get as ReturnType<typeof vi.fn>;
const put = api.put as ReturnType<typeof vi.fn>;

const SOLICITUDES = [
	{
		id: 1,
		nombre: 'Comisión del Club',
		contacto: 'club@demo.com',
		tipo: 'colecta',
		mensaje: 'Recaudamos para arreglar el techo del vestuario.',
		estado: 'pendiente',
		creado_en: '2026-10-15T10:00:00Z'
	},
	{
		id: 2,
		nombre: 'María Pérez',
		contacto: '11 5555-1234',
		tipo: 'publicidad',
		mensaje: 'Feria de emprendedores el sábado en la plaza.',
		estado: 'pendiente',
		creado_en: '2026-10-14T10:00:00Z'
	}
];

beforeEach(() => {
	get.mockReset();
	put.mockReset().mockResolvedValue({});
	get.mockImplementation(async (url: string) => {
		if (url.startsWith('/solicitudes-publicidad')) return SOLICITUDES;
		return [];
	});
	auth.login('t', { id: 1, nombre: 'Admin', email: 'a@d.com', rol: 'superadmin' });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const abrir = async () => {
	render(Admin);
	await userEvent.click(await screen.findByRole('button', { name: 'Solicitudes' }));
};

describe('solicitudes de difusión en el panel (RF-06)', () => {
	it('lista los pedidos con contacto, tipo y mensaje', async () => {
		await abrir();
		expect(await screen.findByText('Comisión del Club')).toBeInTheDocument();
		expect(screen.getByText('club@demo.com · 15/10/2026')).toBeInTheDocument();
		expect(screen.getByText('Colecta / evento')).toBeInTheDocument();
		expect(
			screen.getByText('Recaudamos para arreglar el techo del vestuario.')
		).toBeInTheDocument();
		expect(screen.getByText('Feria de emprendedores el sábado en la plaza.')).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/solicitudes-publicidad');
	});

	it('atender la marca en el backend y la saca de pendientes', async () => {
		await abrir();
		await screen.findByText('Comisión del Club');
		await userEvent.click(screen.getAllByRole('button', { name: 'Atender' })[0]);
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/solicitudes-publicidad/1', { estado: 'atendida' })
		);
		await vi.waitFor(() => expect(screen.queryByText('Comisión del Club')).not.toBeInTheDocument());
		expect(screen.getByText('María Pérez')).toBeInTheDocument();
	});

	it('descartar también la resuelve', async () => {
		await abrir();
		await screen.findByText('María Pérez');
		await userEvent.click(screen.getAllByRole('button', { name: 'Descartar' })[1]);
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/solicitudes-publicidad/2', { estado: 'descartada' })
		);
	});

	it('sin pendientes lo dice y "Ver todas" recarga con el filtro', async () => {
		get.mockImplementation(async (url: string) => {
			if (url === '/solicitudes-publicidad?todas=true') return [];
			if (url.startsWith('/solicitudes-publicidad')) return [];
			return [];
		});
		await abrir();
		expect(await screen.findByText('No hay solicitudes pendientes.')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
		await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/solicitudes-publicidad?todas=true'));
		expect(await screen.findByText('Todavía no llegó ninguna solicitud.')).toBeInTheDocument();
	});

	it('si falla la carga muestra el error', async () => {
		get.mockImplementation(async (url: string) => {
			if (url.startsWith('/solicitudes-publicidad')) throw new ApiError(500, 'Error interno');
			return [];
		});
		await abrir();
		expect(await screen.findByText('Error interno')).toBeInTheDocument();
	});
});
