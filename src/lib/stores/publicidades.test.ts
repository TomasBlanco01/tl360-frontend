import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conModoMock } from '../../tests/helpers';

const api = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };

async function cargar(modo: 'true' | 'false') {
	vi.doMock('$lib/api', () => ({ api }));
	return (await conModoMock(modo, () => import('./publicidades.svelte'))).publicidades;
}

const nueva = { empresa_id: 4, titulo: '2x1', descripcion: 'Este mes', imagen_url: '' };

beforeEach(() => {
	api.get.mockReset().mockResolvedValue([]);
	api.post.mockReset();
	api.delete.mockReset().mockResolvedValue({});
});

describe('publicidades con backend real', () => {
	it('al cargar pide la lista al backend', async () => {
		api.get.mockResolvedValue([{ id: '1', ...nueva }]);
		const store = await cargar('false');
		await vi.waitFor(() => expect(store.items).toHaveLength(1));
		expect(api.get).toHaveBeenCalledWith('/publicidades');
	});

	it('crear publica en el backend y la muestra primero', async () => {
		api.get.mockResolvedValue([{ id: '1', ...nueva, titulo: 'vieja' }]);
		api.post.mockResolvedValue({ id: '2', ...nueva });
		const store = await cargar('false');
		await vi.waitFor(() => expect(store.items).toHaveLength(1));
		store.crear(nueva);
		await vi.waitFor(() => expect(store.items).toHaveLength(2));
		expect(api.post).toHaveBeenCalledWith('/publicidades', nueva);
		expect(store.items[0].id).toBe('2');
	});

	it('eliminar la saca de la lista y borra en el backend', async () => {
		api.get.mockResolvedValue([
			{ id: '1', ...nueva },
			{ id: '2', ...nueva, empresa_id: 5 }
		]);
		const store = await cargar('false');
		await vi.waitFor(() => expect(store.items).toHaveLength(2));
		store.eliminar('1');
		expect(store.items.map((p) => p.id)).toEqual(['2']);
		expect(api.delete).toHaveBeenCalledWith('/publicidades/1');
	});

	it('si el backend falla al cargar, no rompe: queda vacío', async () => {
		api.get.mockRejectedValue(new Error('sin conexión'));
		const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = await cargar('false');
		await vi.waitFor(() => expect(consola).toHaveBeenCalled());
		expect(store.items).toEqual([]);
	});

	it('porEmpresa filtra por comercio', async () => {
		api.get.mockResolvedValue([
			{ id: '1', ...nueva, empresa_id: 4 },
			{ id: '2', ...nueva, empresa_id: 5 }
		]);
		const store = await cargar('false');
		await vi.waitFor(() => expect(store.items).toHaveLength(2));
		expect(store.porEmpresa(5).map((p) => p.id)).toEqual(['2']);
	});
});

describe('publicidades en modo mock (localStorage)', () => {
	it('la primera vez precarga ejemplos y los guarda', async () => {
		const store = await cargar('true');
		expect(store.items.length).toBeGreaterThanOrEqual(10);
		expect(JSON.parse(localStorage.getItem('publicidades')!)).toHaveLength(store.items.length);
		expect(api.get).not.toHaveBeenCalled();
	});

	it('respeta lo que ya había guardado', async () => {
		localStorage.setItem('publicidades', JSON.stringify([{ id: 'x', ...nueva }]));
		const store = await cargar('true');
		expect(store.items).toHaveLength(1);
	});

	it('crear y eliminar persisten', async () => {
		localStorage.setItem('publicidades', '[]');
		const store = await cargar('true');
		const creada = store.crear(nueva)!;
		expect(creada.id).toBeTruthy();
		expect(JSON.parse(localStorage.getItem('publicidades')!)).toHaveLength(1);
		store.eliminar(creada.id);
		expect(store.items).toEqual([]);
		expect(JSON.parse(localStorage.getItem('publicidades')!)).toEqual([]);
	});

	it('un JSON guardado corrupto no rompe la app', async () => {
		localStorage.setItem('publicidades', '{roto');
		const store = await cargar('true');
		expect(store.items).toEqual([]);
	});
});
