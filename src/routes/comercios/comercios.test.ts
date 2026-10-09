import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { api } from '$lib/api';
import { empresa, setUrl } from '../../tests/helpers';
import Comercios from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const get = api.get as ReturnType<typeof vi.fn>;

const rubros = [
	{ id: 1, nombre: 'Peluquerías', cantidad: 5 },
	{ id: 2, nombre: 'Gimnasios', cantidad: 3 },
	{ id: 3, nombre: 'Rubro vacío', cantidad: 0 }
];
const lote = (desde: number, cuantos: number) =>
	Array.from({ length: cuantos }, (_, i) =>
		empresa({ id: desde + i, nombre: `Comercio ${desde + i}` })
	);

/** Responde /categorias y delega los pedidos a /empresas en `porPedido`. */
function backend(porPedido: (url: string) => unknown) {
	get.mockImplementation(async (url: string) => (url === '/categorias' ? rubros : porPedido(url)));
}
const pedidosDeEmpresas = () =>
	get.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith('/empresas?'));

beforeEach(() => {
	get.mockReset();
	setUrl('/comercios');
});

describe('listado de comercios', () => {
	it('pide la primera página al backend (24 + 1 para saber si hay más)', async () => {
		backend(() => lote(1, 3));
		render(Comercios);
		expect(await screen.findByText('Comercio 1')).toBeInTheDocument();
		expect(pedidosDeEmpresas()[0]).toBe('/empresas?limit=25&offset=0');
	});

	it('muestra una tarjeta por comercio', async () => {
		backend(() => lote(1, 3));
		render(Comercios);
		await screen.findByText('Comercio 3');
		expect(
			screen
				.getAllByRole('link')
				.filter((a) => /^\/comercios\/\d+$/.test(a.getAttribute('href') ?? ''))
		).toHaveLength(3);
	});

	it('si hay más de 24 muestra "Cargar más" y solo 24 tarjetas', async () => {
		backend(() => lote(1, 25));
		render(Comercios);
		await screen.findByText('Comercio 24');
		expect(screen.queryByText('Comercio 25')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cargar más comercios' })).toBeInTheDocument();
	});

	it('si no hay más resultados no muestra "Cargar más"', async () => {
		backend(() => lote(1, 24));
		render(Comercios);
		await screen.findByText('Comercio 24');
		expect(screen.queryByRole('button', { name: 'Cargar más comercios' })).not.toBeInTheDocument();
	});

	it('"Cargar más" trae la página siguiente y la agrega', async () => {
		backend((url) => (url.includes('offset=0') ? lote(1, 25) : lote(25, 2)));
		render(Comercios);
		await screen.findByText('Comercio 24');
		await userEvent.click(screen.getByRole('button', { name: 'Cargar más comercios' }));
		expect(await screen.findByText('Comercio 25')).toBeInTheDocument();
		expect(screen.getByText('Comercio 1')).toBeInTheDocument();
		expect(pedidosDeEmpresas().at(-1)).toBe('/empresas?limit=25&offset=24');
		expect(screen.queryByRole('button', { name: 'Cargar más comercios' })).not.toBeInTheDocument();
	});

	it('sin resultados muestra el estado vacío', async () => {
		backend(() => []);
		render(Comercios);
		expect(await screen.findByText('No encontramos comercios')).toBeInTheDocument();
	});

	it('la búsqueda de la URL viaja al backend', async () => {
		setUrl('/comercios?q=peluq&categoria=1');
		backend(() => lote(1, 1));
		render(Comercios);
		await screen.findByText('Comercio 1');
		expect(pedidosDeEmpresas()[0]).toBe('/empresas?q=peluq&categoria_id=1&limit=25&offset=0');
	});

	it('al escribir busca de nuevo (con espera) y reemplaza los resultados', async () => {
		backend((url) =>
			url.includes('q=gim') ? [empresa({ id: 9, nombre: 'Gimnasio Fuerte' })] : lote(1, 2)
		);
		render(Comercios);
		await screen.findByText('Comercio 1');
		await userEvent.type(screen.getByPlaceholderText(/Buscar/), 'gim');
		expect(await screen.findByText('Gimnasio Fuerte')).toBeInTheDocument();
		await vi.waitFor(() => expect(screen.queryByText('Comercio 1')).not.toBeInTheDocument());
		// se espera a que termine de escribir: no hay un pedido por cada letra
		expect(pedidosDeEmpresas().filter((u) => u.includes('q=')).length).toBeLessThan(3);
	});

	it('el selector de rubros solo ofrece los que tienen comercios', async () => {
		backend(() => lote(1, 1));
		render(Comercios);
		await screen.findByText('Comercio 1');
		const opciones = screen.getAllByRole('option').map((o) => o.textContent);
		expect(opciones).toEqual(['Todos los rubros', 'Peluquerías', 'Gimnasios']);
	});

	it('elegir un rubro filtra en el backend', async () => {
		backend(() => lote(1, 1));
		render(Comercios);
		await screen.findByText('Comercio 1');
		await userEvent.selectOptions(screen.getByRole('combobox'), 'Gimnasios');
		await vi.waitFor(() =>
			expect(pedidosDeEmpresas().at(-1)).toBe('/empresas?categoria_id=2&limit=25&offset=0')
		);
	});
});
