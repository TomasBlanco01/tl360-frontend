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

const rubro = (id: number, nombre: string, cantidad: number, turnos = false) => ({
	id,
	nombre,
	cantidad,
	turnos_habilitados: turnos
});

const rubros = [
	rubro(1, 'Peluquerías', 56, true),
	rubro(2, 'Psicólogos', 91, true),
	rubro(3, 'Carnicerías', 35),
	rubro(4, 'Pizzerías', 65),
	rubro(5, 'Vacío', 0)
];

function backend(extra: Record<string, unknown> = {}) {
	get.mockImplementation(async (url: string) => {
		if (url in extra) return extra[url];
		if (url === '/rubros') return rubros;
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
	it('agrupa los rubros según si toman turnos y explica qué es cada grupo', async () => {
		render(Home);
		const conTurnos = (await screen.findByText('Con reserva de turnos online')).closest('div')!;
		expect(conTurnos).toHaveTextContent('podés sacar turno');
		expect(within(conTurnos).getByRole('button', { name: /Peluquerías/ })).toBeInTheDocument();
		const directorio = screen.getByText('Solo directorio').closest('div')!;
		expect(within(directorio).getByRole('button', { name: /Carnicerías/ })).toBeInTheDocument();
		// Ya no hay un "· N comercios" suelto en el título: cada rubro muestra su cantidad.
		expect(screen.queryByText(/· \d+ comercios/)).not.toBeInTheDocument();
		expect(screen.getByTitle('91 comercios')).toBeInTheDocument();
	});

	it('dentro de cada grupo ordena los rubros alfabéticamente', async () => {
		render(Home);
		const conTurnos = (await screen.findByText('Con reserva de turnos online')).closest('div')!;
		const botones = within(conTurnos)
			.getAllByRole('button')
			.map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
		expect(botones[0]).toContain('Peluquerías');
		expect(botones[1]).toContain('Psicólogos');
	});

	it('el buscador interno filtra los rubros mientras se escribe', async () => {
		render(Home);
		await screen.findByText('Solo directorio');
		const buscador = screen.getByRole('searchbox', { name: 'Buscar un rubro' });
		await userEvent.type(buscador, 'pizz');
		expect(screen.getByRole('button', { name: /Pizzerías/ })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Peluquerías/ })).not.toBeInTheDocument();
		expect(screen.queryByText('Con reserva de turnos online')).not.toBeInTheDocument();
		await userEvent.clear(buscador);
		await userEvent.type(buscador, 'zzz');
		expect(screen.getByText(/No encontramos rubros/)).toBeInTheDocument();
	});

	it('no muestra los rubros sin comercios', async () => {
		render(Home);
		await screen.findByText('Solo directorio');
		expect(screen.queryByText('Vacío')).not.toBeInTheDocument();
	});

	it('marca los rubros que toman turnos online', async () => {
		render(Home);
		await screen.findByText('Solo directorio');
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
		await userEvent.type(screen.getByPlaceholderText(/Buscar por nombre/), 'café & té');
		await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
		expect(goto).toHaveBeenCalledWith('/comercios?q=caf%C3%A9%20%26%20t%C3%A9');
	});

	it('buscar sin texto lleva al listado completo', async () => {
		render(Home);
		await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
		expect(goto).toHaveBeenCalledWith('/comercios');
	});

	it('con muchos rubros en un grupo, ofrece verlos todos', async () => {
		const muchos = Array.from({ length: 20 }, (_, i) => rubro(100 + i, `Rubro ${i}`, 20 - i, true));
		backend({ '/rubros': muchos });
		render(Home);
		await screen.findByText('Con reserva de turnos online');
		// En orden alfabético, "Rubro 9" es el último.
		expect(screen.queryByRole('button', { name: /Rubro 9/ })).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Ver los 20 rubros' }));
		expect(screen.getByRole('button', { name: /Rubro 9/ })).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
		expect(screen.queryByRole('button', { name: /Rubro 9/ })).not.toBeInTheDocument();
	});

	it('sin el dato de turnos (modo mock) muestra todo en un solo grupo', async () => {
		backend({
			'/rubros': [
				{ id: 1, nombre: 'Peluquería' },
				{ id: 2, nombre: 'Gimnasio' }
			]
		});
		render(Home);
		expect(
			await screen.findByText('Con reserva de turnos online', { selector: 'p' })
		).toBeInTheDocument();
		expect(screen.queryByText('Solo directorio')).not.toBeInTheDocument();
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
