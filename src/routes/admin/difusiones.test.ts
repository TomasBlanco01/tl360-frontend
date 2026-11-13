import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import Admin from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const put = api.put as ReturnType<typeof vi.fn>;
const borrar = api.delete as ReturnType<typeof vi.fn>;

const DIFUSIONES = [
	{
		id: 1,
		tipo: 'colecta',
		titulo: 'Techo del vestuario',
		descripcion: 'Recaudamos para arreglar el techo del vestuario.',
		solicitante_nombre: 'Comisión del Club',
		solicitante_contacto: 'club@demo.com',
		estado: 'pendiente',
		creado_en: '2026-10-15T10:00:00Z'
	},
	{
		id: 2,
		tipo: 'evento',
		titulo: 'Feria de emprendedores',
		descripcion: 'Feria de emprendedores el sábado en la plaza.',
		solicitante_nombre: 'María Pérez',
		solicitante_contacto: '11 5555-1234',
		estado: 'pendiente',
		creado_en: '2026-10-14T10:00:00Z'
	}
];

beforeEach(() => {
	get.mockReset();
	post.mockReset();
	borrar.mockReset().mockResolvedValue({});
	put.mockReset().mockImplementation(async (url: string, cuerpo: { estado: string }) => ({
		...DIFUSIONES[Number(url.split('/')[2]) - 1],
		estado: cuerpo.estado
	}));
	get.mockImplementation(async (url: string) => {
		if (url.startsWith('/difusiones')) return DIFUSIONES;
		return [];
	});
	auth.login('t', { id: 1, nombre: 'Admin', email: 'a@d.com', rol: 'superadmin' });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const abrir = async () => {
	render(Admin);
	await userEvent.click(await screen.findByRole('button', { name: 'Difusiones' }));
};
const fila = (texto: string) => screen.getByText(texto).closest('li')!;

describe('difusiones en el panel (RF-06)', () => {
	it('lista los pedidos pendientes con solicitante, contacto, tipo y estado', async () => {
		await abrir();
		expect(await screen.findByText('Techo del vestuario')).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/difusiones?estado=pendiente');
		expect(screen.getByText('Comisión del Club · club@demo.com · 15/10/2026')).toBeInTheDocument();
		expect(within(fila('Techo del vestuario')).getByText('Colecta')).toBeInTheDocument();
		expect(within(fila('Feria de emprendedores')).getByText('Evento')).toBeInTheDocument();
		expect(within(fila('Techo del vestuario')).getByText('Pendiente')).toBeInTheDocument();
	});

	it('aprobar la marca en el backend y la saca de pendientes', async () => {
		await abrir();
		await screen.findByText('Techo del vestuario');
		await userEvent.click(
			within(fila('Techo del vestuario')).getByRole('button', { name: 'Aprobar' })
		);
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/difusiones/1/estado', { estado: 'aprobada' })
		);
		await vi.waitFor(() =>
			expect(screen.queryByText('Techo del vestuario')).not.toBeInTheDocument()
		);
		expect(screen.getByText('Feria de emprendedores')).toBeInTheDocument();
	});

	it('rechazar también la resuelve', async () => {
		await abrir();
		await screen.findByText('Feria de emprendedores');
		await userEvent.click(
			within(fila('Feria de emprendedores')).getByRole('button', { name: 'Rechazar' })
		);
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/difusiones/2/estado', { estado: 'rechazada' })
		);
	});

	it('eliminar pide confirmación', async () => {
		await abrir();
		await screen.findByText('Techo del vestuario');
		await userEvent.click(
			within(fila('Techo del vestuario')).getByRole('button', { name: 'Eliminar' })
		);
		expect(await screen.findByText('¿Eliminar “Techo del vestuario”?')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
		await vi.waitFor(() => expect(borrar).toHaveBeenCalledWith('/difusiones/1'));
	});

	it('el superadmin publica una difusión de la plataforma', async () => {
		post.mockResolvedValue({ ...DIFUSIONES[0], id: 3, estado: 'aprobada' });
		await abrir();
		await screen.findByText('Techo del vestuario');
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		expect(await screen.findByText('El título es obligatorio.')).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText(/^Título/), 'Colecta de abrigo');
		await userEvent.type(
			screen.getByLabelText(/^Descripción/),
			'Juntamos abrigos hasta el viernes'
		);
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/difusiones', {
				tipo: 'colecta',
				titulo: 'Colecta de abrigo',
				descripcion: 'Juntamos abrigos hasta el viernes',
				url_imagen: null
			})
		);
	});

	it('sin pendientes lo dice y "Ver todas" recarga con el filtro', async () => {
		get.mockImplementation(async () => []);
		await abrir();
		expect(await screen.findByText('No hay pedidos pendientes.')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
		await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/difusiones?estado=todas'));
		expect(await screen.findByText('Todavía no hay difusiones.')).toBeInTheDocument();
	});

	it('si falla la carga muestra el error', async () => {
		get.mockImplementation(async (url: string) => {
			if (url.startsWith('/difusiones')) throw new ApiError(500, 'Error interno');
			return [];
		});
		await abrir();
		expect(await screen.findByText('Error interno')).toBeInTheDocument();
	});
});
