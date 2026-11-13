import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conModoMock } from '../../tests/helpers';
import type { Difusion } from '$lib/types';

const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };

async function cargar() {
	vi.doMock('$lib/api', () => ({ api }));
	return (await conModoMock('false', () => import('./publicidades.svelte'))).publicidades;
}

const nueva = {
	empresa_id: 4,
	titulo: '2x1',
	descripcion: 'Este mes',
	url_imagen: 'https://x.com/a.jpg'
};
const difusion: Difusion = {
	id: 7,
	tipo: 'colecta',
	titulo: 'Colecta',
	descripcion: 'Juntamos abrigos',
	url_imagen: null,
	solicitante_nombre: 'Club',
	solicitante_contacto: 'club@x.com',
	estado: 'aprobada',
	creado_en: '2026-11-01T10:00:00Z'
};

function backend(publicidades: unknown[] = [], difusiones: unknown[] = []) {
	api.get.mockImplementation(async (url: string) =>
		url === '/difusiones' ? difusiones : url.startsWith('/publicidades') ? publicidades : []
	);
}

beforeEach(() => {
	api.get.mockReset();
	backend();
	api.post.mockReset();
	api.put.mockReset();
	api.delete.mockReset().mockResolvedValue({});
});

describe('carrusel de publicidades y difusiones (RF-06)', () => {
	it('al cargar pide las publicidades y las difusiones vigentes', async () => {
		backend([{ id: '1', ...nueva, estado: 'aprobada' }], [difusion]);
		const store = await cargar();
		await vi.waitFor(() => expect(store.items).toHaveLength(1));
		expect(api.get).toHaveBeenCalledWith('/publicidades');
		expect(api.get).toHaveBeenCalledWith('/difusiones');
		expect(store.difusiones).toHaveLength(1);
	});

	it('el carrusel pone primero los comercios y después las difusiones, sin ficha', async () => {
		backend([{ id: '1', ...nueva, estado: 'aprobada' }], [difusion]);
		const store = await cargar();
		await vi.waitFor(() => expect(store.carrusel).toHaveLength(2));
		expect(store.carrusel[0].empresa_id).toBe(4);
		expect(store.carrusel[1]).toMatchObject({
			id: 'difusion-7',
			empresa_id: null,
			titulo: 'Colecta'
		});
		// sin imagen propia, la difusión usa una de relleno
		expect(store.carrusel[1].url_imagen).toMatch(/^https:\/\//);
	});

	it('crear: la del dueño queda pendiente y no entra al carrusel', async () => {
		api.post.mockResolvedValue({ id: '2', ...nueva, estado: 'pendiente' });
		const store = await cargar();
		const creada = await store.crear(nueva);
		expect(api.post).toHaveBeenCalledWith('/publicidades', nueva);
		expect(creada.estado).toBe('pendiente');
		expect(store.items).toEqual([]);
	});

	it('crear: la del superadmin queda aprobada y se muestra primero', async () => {
		backend([{ id: '1', ...nueva, titulo: 'vieja', estado: 'aprobada' }]);
		api.post.mockResolvedValue({ id: '2', ...nueva, estado: 'aprobada' });
		const store = await cargar();
		await vi.waitFor(() => expect(store.items).toHaveLength(1));
		await store.crear(nueva);
		expect(store.items.map((p) => p.id)).toEqual(['2', '1']);
	});

	it('cambiar el estado la saca del carrusel si deja de estar aprobada', async () => {
		backend([{ id: '1', ...nueva, estado: 'aprobada' }]);
		api.put.mockResolvedValue({ id: '1', ...nueva, estado: 'finalizada' });
		const store = await cargar();
		await vi.waitFor(() => expect(store.items).toHaveLength(1));
		await store.cambiarEstado('1', 'finalizada');
		expect(api.put).toHaveBeenCalledWith('/publicidades/1/estado', { estado: 'finalizada' });
		expect(store.items).toEqual([]);
	});

	it('delComercio pide todas las del comercio, en cualquier estado', async () => {
		const store = await cargar();
		await store.delComercio(4);
		expect(api.get).toHaveBeenCalledWith('/publicidades?empresa_id=4&estado=todas');
	});

	it('eliminar la saca de la lista y borra en el backend', async () => {
		backend([
			{ id: '1', ...nueva, estado: 'aprobada' },
			{ id: '2', ...nueva, empresa_id: 5, estado: 'aprobada' }
		]);
		const store = await cargar();
		await vi.waitFor(() => expect(store.items).toHaveLength(2));
		await store.eliminar('1');
		expect(store.items.map((p) => p.id)).toEqual(['2']);
		expect(api.delete).toHaveBeenCalledWith('/publicidades/1');
	});

	it('si el backend falla al cargar, no rompe: queda vacío', async () => {
		api.get.mockRejectedValue(new Error('sin conexión'));
		const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = await cargar();
		await vi.waitFor(() => expect(consola).toHaveBeenCalled());
		expect(store.carrusel).toEqual([]);
	});
});
