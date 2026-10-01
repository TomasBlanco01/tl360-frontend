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

const REPORTES = [
	{
		id: 10,
		empresa_id: 7,
		empresa_nombre: 'Estilo Urbano',
		usuario_nombre: 'Martina',
		motivo: 'Datos falsos',
		resuelto: false,
		creado_en: '2026-09-20T10:00:00Z'
	},
	{
		id: 11,
		empresa_id: 8,
		empresa_nombre: 'Gym Norte',
		usuario_nombre: null,
		motivo: 'Cerró hace meses',
		resuelto: false,
		creado_en: '2026-09-21T10:00:00Z'
	}
];

beforeEach(() => {
	get.mockReset();
	put.mockReset().mockResolvedValue({});
	get.mockImplementation(async (url: string) => (url === '/reportes' ? REPORTES : []));
	auth.login('t', { id: 1, nombre: 'Admin', email: 'a@d.com', rol: 'superadmin' });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const abrir = async () => {
	render(Admin);
	await userEvent.click(await screen.findByRole('button', { name: 'Reportes' }));
};

describe('reportes en el panel de administración', () => {
	it('lista los pendientes con comercio, motivo y autor', async () => {
		await abrir();
		expect(await screen.findByRole('link', { name: 'Estilo Urbano' })).toHaveAttribute(
			'href',
			'/comercios/7'
		);
		expect(screen.getByText('Datos falsos')).toBeInTheDocument();
		expect(screen.getByText('Reportado por Martina')).toBeInTheDocument();
		expect(screen.getByText('Reportado por un usuario eliminado')).toBeInTheDocument();
	});

	it('sin reportes lo dice', async () => {
		get.mockImplementation(async () => []);
		await abrir();
		expect(await screen.findByText('No hay reportes pendientes.')).toBeInTheDocument();
	});

	it('marcar resuelto lo llama al backend y lo saca de la lista', async () => {
		await abrir();
		await screen.findByText('Datos falsos');
		await userEvent.click(screen.getAllByRole('button', { name: 'Marcar resuelto' })[0]);
		await vi.waitFor(() => expect(put).toHaveBeenCalledWith('/reportes/10/resolver'));
		await vi.waitFor(() => expect(screen.queryByText('Datos falsos')).not.toBeInTheDocument());
		expect(screen.getByText('Cerró hace meses')).toBeInTheDocument();
	});

	it('si falla la resolución muestra el error y conserva el reporte', async () => {
		put.mockRejectedValue(new ApiError(404, 'Reporte no encontrado'));
		await abrir();
		await screen.findByText('Datos falsos');
		await userEvent.click(screen.getAllByRole('button', { name: 'Marcar resuelto' })[0]);
		expect(await screen.findByText('Reporte no encontrado')).toBeInTheDocument();
		expect(screen.getByText('Datos falsos')).toBeInTheDocument();
	});

	it('si no se pueden cargar muestra el error', async () => {
		get.mockImplementation(async (url: string) => {
			if (url === '/reportes') throw new ApiError(500, 'Error interno');
			return [];
		});
		await abrir();
		expect(await screen.findByText('Error interno')).toBeInTheDocument();
	});
});
