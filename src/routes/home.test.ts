import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { api } from '$lib/api';
import { empresa } from '../tests/helpers';
import Home from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return {
		...real,
		api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
	};
});

const get = api.get as ReturnType<typeof vi.fn>;

const rubro = (
	id: number,
	nombre: string,
	super_rubro: string | null,
	cantidad: number,
	turnos = false
) => ({
	id,
	nombre,
	super_rubro,
	cantidad,
	turnos_habilitados: turnos
});

const rubros = [
	rubro(1, 'Peluquerías', 'Salud, belleza y bienestar', 56, true),
	rubro(2, 'Psicólogos', 'Salud, belleza y bienestar', 91, true),
	rubro(3, 'Carnicerías', 'Gastronomía', 35),
	rubro(4, 'Pizzerías', 'Gastronomía', 65),
	rubro(5, 'Vacío', 'Gastronomía', 0)
];

function backend(extra: Record<string, unknown> = {}) {
	get.mockImplementation(async (url: string) => {
		if (url in extra) return extra[url];
		if (url === '/categorias') return rubros;
		if (url.startsWith('/empresas'))
			return [empresa({ id: 1, nombre: 'Destacado 1' }), empresa({ id: 2, nombre: 'Destacado 2' })];
		return [];
	});
}

beforeEach(() => {
	get.mockReset();
	backend();
});

describe('portada', () => {
	it('agrupa los rubros por súper rubro, ordenados por cantidad de comercios', async () => {
		render(Home);
		const salud = (await screen.findByText(/Salud, belleza y bienestar/)).closest('div')!;
		expect(salud).toHaveTextContent('147 comercios');
		const gastro = screen.getByText(/^Gastronomía/).closest('div')!;
		expect(gastro).toHaveTextContent('100 comercios');
		// el grupo con más comercios va primero
		const titulos = screen
			.getAllByText(/comercios$/)
			.map((e) => e.parentElement?.textContent ?? '');
		expect(titulos[0]).toContain('Salud');
	});

	it('dentro de cada grupo ordena los rubros de más a menos comercios', async () => {
		render(Home);
		const salud = (await screen.findByText(/Salud, belleza y bienestar/)).closest('div')!;
		const botones = within(salud)
			.getAllByRole('button')
			.map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
		expect(botones[0]).toContain('Psicólogos');
		expect(botones[1]).toContain('Peluquerías');
	});

	it('no muestra los rubros sin comercios', async () => {
		render(Home);
		await screen.findByText(/Gastronomía/);
		expect(screen.queryByText('Vacío')).not.toBeInTheDocument();
	});

	it('marca los rubros que toman turnos online', async () => {
		render(Home);
		await screen.findByText(/Gastronomía/);
		expect(
			screen
				.getByRole('button', { name: /Peluquerías/ })
				.querySelector('[title="Con reserva de turnos"]')
		).not.toBeNull();
		expect(
			screen
				.getByRole('button', { name: /Carnicerías/ })
				.querySelector('[title="Con reserva de turnos"]')
		).toBeNull();
	});

	it('tocar un rubro lleva al listado filtrado', async () => {
		render(Home);
		await userEvent.click(await screen.findByRole('button', { name: /Pizzerías/ }));
		expect(goto).toHaveBeenCalledWith('/comercios?categoria=4');
	});

	it('buscar lleva al listado con el texto (codificado)', async () => {
		render(Home);
		await userEvent.type(screen.getByPlaceholderText(/Buscar/), 'café & té');
		await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
		expect(goto).toHaveBeenCalledWith('/comercios?q=caf%C3%A9%20%26%20t%C3%A9');
	});

	it('buscar sin texto lleva al listado completo', async () => {
		render(Home);
		await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
		expect(goto).toHaveBeenCalledWith('/comercios');
	});

	it('con muchos rubros en un grupo, ofrece verlos todos', async () => {
		const muchos = Array.from({ length: 20 }, (_, i) =>
			rubro(100 + i, `Rubro ${i}`, 'Servicios', 20 - i)
		);
		backend({ '/categorias': muchos });
		render(Home);
		await screen.findByText(/^Servicios/);
		expect(screen.queryByRole('button', { name: /Rubro 19/ })).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Ver los 20 rubros' }));
		expect(screen.getByRole('button', { name: /Rubro 19/ })).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
		expect(screen.queryByRole('button', { name: /Rubro 19/ })).not.toBeInTheDocument();
	});

	it('sin agrupación (modo mock) muestra todo en un solo grupo', async () => {
		backend({
			'/categorias': [
				{ id: 1, nombre: 'Peluquería' },
				{ id: 2, nombre: 'Gimnasio' }
			]
		});
		render(Home);
		expect(await screen.findByText('Rubros', { selector: 'p' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Peluquería/ })).toBeInTheDocument();
	});

	it('pide solo 6 comercios destacados, no todo el catálogo', async () => {
		render(Home);
		await screen.findByText('Destacado 1');
		expect(get).toHaveBeenCalledWith('/empresas?limit=6');
	});

	it('mientras carga muestra un aviso', () => {
		get.mockImplementation(() => new Promise(() => {}));
		render(Home);
		expect(screen.getByText('Cargando categorías...')).toBeInTheDocument();
	});
});
