import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { api } from '$lib/api';
import Mapa from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const get = api.get as ReturnType<typeof vi.fn>;

const PUNTOS = [
	{ id: 1, nombre: 'Lejano', lat: -35.9, lng: -62.6, categoria_id: 1, verificado: false },
	{ id: 2, nombre: 'Cerquita', lat: -35.9712, lng: -62.7335, categoria_id: 1, verificado: true }
];

beforeEach(() => {
	get.mockReset();
	get.mockImplementation(async (url: string) => {
		if (url === '/categorias')
			return [
				{ id: 1, nombre: 'Peluquerías' },
				{ id: 2, nombre: 'Gimnasios' }
			];
		if (url.startsWith('/empresas/mapa')) return PUNTOS;
		return [];
	});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
// Se define sobre el navigator real (jsdom no trae geolocation): Leaflet lee otras propiedades al cargarse.
function conGeolocalizacion(geo: unknown) {
	Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
}
afterEach(() => {
	Reflect.deleteProperty(navigator, 'geolocation');
});

describe('mapa de comercios', () => {
	it('pide los puntos y muestra cuántos hay', async () => {
		render(Mapa);
		expect(await screen.findByText('2 comercios en el mapa')).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/empresas/mapa');
		expect(screen.getByTestId('mapa')).toBeInTheDocument();
	});

	it('filtra por rubro pidiéndole al backend solo ese rubro', async () => {
		render(Mapa);
		await screen.findByText('2 comercios en el mapa');
		await userEvent.selectOptions(screen.getByLabelText('Rubro'), 'Gimnasios');
		await waitFor(() => expect(get).toHaveBeenCalledWith('/empresas/mapa?categoria_id=2'));
	});

	it('si no hay comercios geolocalizados lo aclara', async () => {
		get.mockImplementation(async (url: string) => (url.startsWith('/empresas/mapa') ? [] : []));
		render(Mapa);
		expect(
			await screen.findByText('Todavía no hay comercios geolocalizados en este rubro.')
		).toBeInTheDocument();
	});

	it('si falla la carga muestra el error', async () => {
		get.mockImplementation(async (url: string) => {
			if (url.startsWith('/empresas/mapa')) throw new Error('boom');
			return [];
		});
		render(Mapa);
		expect(await screen.findByText('No se pudo cargar el mapa.')).toBeInTheDocument();
	});

	describe('cerca de mí', () => {
		it('con permiso, lista los más cercanos ordenados por distancia', async () => {
			conGeolocalizacion({
				getCurrentPosition: (ok: (p: unknown) => void) =>
					ok({ coords: { latitude: -35.9711, longitude: -62.7333 } })
			});
			render(Mapa);
			await screen.findByText('2 comercios en el mapa');
			await userEvent.click(screen.getByRole('button', { name: 'Cerca de mí' }));
			const lista = (await screen.findByText('Los más cercanos')).nextElementSibling as HTMLElement;
			const items = within(lista).getAllByRole('link');
			const nombres = items.map((a) => a.textContent ?? '');
			expect(nombres[0]).toContain('Cerquita');
			expect(nombres[1]).toContain('Lejano');
			expect(screen.getByText('Los más cercanos')).toBeInTheDocument();
		});

		it('si el usuario niega el permiso lo explica', async () => {
			conGeolocalizacion({ getCurrentPosition: (_ok: unknown, err: () => void) => err() });
			render(Mapa);
			await screen.findByText('2 comercios en el mapa');
			await userEvent.click(screen.getByRole('button', { name: 'Cerca de mí' }));
			expect(await screen.findByText(/No pudimos obtener tu ubicación/)).toBeInTheDocument();
			expect(screen.queryByText('Los más cercanos')).not.toBeInTheDocument();
		});

		it('si el navegador no soporta geolocalización lo avisa', async () => {
			render(Mapa);
			await screen.findByText('2 comercios en el mapa');
			await userEvent.click(screen.getByRole('button', { name: 'Cerca de mí' }));
			expect(
				await screen.findByText('Tu navegador no permite obtener la ubicación.')
			).toBeInTheDocument();
		});
	});
});
