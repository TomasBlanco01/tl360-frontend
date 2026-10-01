import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conModoMock } from '../../tests/helpers';

const api = { get: vi.fn(), put: vi.fn(), delete: vi.fn() };

async function cargar(modo: 'true' | 'false') {
	vi.doMock('$lib/api', () => ({ api }));
	const { favoritos } = await conModoMock(modo, () => import('./favoritos.svelte'));
	const { auth } = await import('./auth.svelte');
	return { favoritos, auth };
}
const ana = { id: 7, nombre: 'Ana', email: 'a@b.com', rol: 'cliente' as const };

beforeEach(() => {
	api.get.mockReset();
	api.put.mockReset().mockResolvedValue({});
	api.delete.mockReset().mockResolvedValue({});
});

describe('favoritos con backend real', () => {
	it('sync trae los favoritos del usuario', async () => {
		api.get.mockResolvedValue([3, 5]);
		const { favoritos, auth } = await cargar('false');
		auth.login('t', ana);
		favoritos.sync();
		await vi.waitFor(() => expect(favoritos.ids).toEqual([3, 5]));
		expect(api.get).toHaveBeenCalledWith('/favoritos');
		expect(favoritos.isFavorito(3)).toBe(true);
		expect(favoritos.isFavorito(9)).toBe(false);
	});

	it('sin sesión, sync vacía la lista y no llama a la API', async () => {
		const { favoritos } = await cargar('false');
		favoritos.sync();
		expect(favoritos.ids).toEqual([]);
		expect(api.get).not.toHaveBeenCalled();
	});

	it('marcar un favorito lo agrega al instante y avisa al backend', async () => {
		const { favoritos, auth } = await cargar('false');
		auth.login('t', ana);
		favoritos.toggle(11);
		expect(favoritos.ids).toEqual([11]);
		expect(api.put).toHaveBeenCalledWith('/favoritos/11');
	});

	it('volver a tocarlo lo quita y hace DELETE', async () => {
		const { favoritos, auth } = await cargar('false');
		auth.login('t', ana);
		favoritos.toggle(11);
		favoritos.toggle(11);
		expect(favoritos.ids).toEqual([]);
		expect(api.delete).toHaveBeenCalledWith('/favoritos/11');
	});

	it('si el backend falla, se vuelve a sincronizar con el servidor', async () => {
		api.put.mockRejectedValue(new Error('caído'));
		api.get.mockResolvedValue([]);
		const { favoritos, auth } = await cargar('false');
		auth.login('t', ana);
		favoritos.toggle(11);
		await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith('/favoritos'));
		await vi.waitFor(() => expect(favoritos.ids).toEqual([]));
	});

	it('sin sesión, tocar un favorito no hace nada', async () => {
		const { favoritos } = await cargar('false');
		favoritos.toggle(11);
		expect(favoritos.ids).toEqual([]);
		expect(api.put).not.toHaveBeenCalled();
	});
});

describe('favoritos en modo mock (localStorage por usuario)', () => {
	it('persiste por usuario y no usa la API', async () => {
		const { favoritos, auth } = await cargar('true');
		auth.login('t', ana);
		favoritos.toggle(4);
		favoritos.toggle(8);
		expect(JSON.parse(localStorage.getItem('favoritos:7')!)).toEqual([4, 8]);
		favoritos.toggle(4);
		expect(JSON.parse(localStorage.getItem('favoritos:7')!)).toEqual([8]);
		expect(api.put).not.toHaveBeenCalled();
	});

	it('sync recupera lo guardado de ese usuario', async () => {
		localStorage.setItem('favoritos:7', JSON.stringify([1, 2]));
		localStorage.setItem('favoritos:8', JSON.stringify([9]));
		const { favoritos, auth } = await cargar('true');
		auth.login('t', ana);
		favoritos.sync();
		expect(favoritos.ids).toEqual([1, 2]);
	});
});
