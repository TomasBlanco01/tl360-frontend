import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import RutaAlComercio from './RutaAlComercio.svelte';

const DESTINO: [number, number] = [-35.98, -62.74];

function conGeolocalizacion(concedida: boolean) {
	Object.defineProperty(navigator, 'geolocation', {
		configurable: true,
		value: {
			getCurrentPosition: (ok: PositionCallback, fallo: (error: { code: number }) => void) => {
				if (concedida) {
					ok({ coords: { latitude: -35.97, longitude: -62.73 } } as GeolocationPosition);
				} else {
					fallo({ code: 1 });
				}
			}
		}
	});
}

function conRuta(respuesta: unknown, ok = true) {
	const pedir = vi.fn().mockResolvedValue({ ok, json: async () => respuesta });
	vi.stubGlobal('fetch', pedir);
	return pedir;
}

afterEach(() => {
	Reflect.deleteProperty(navigator, 'geolocation');
	vi.unstubAllGlobals();
});

describe('RutaAlComercio', () => {
	it('ubica al usuario, calcula la ruta con OSRM y avisa al mapa', async () => {
		conGeolocalizacion(true);
		conRuta({
			code: 'Ok',
			routes: [
				{
					distance: 3210,
					duration: 480,
					geometry: {
						coordinates: [
							[-62.73, -35.97],
							[-62.74, -35.98]
						]
					}
				}
			]
		});
		const onruta = vi.fn();
		render(RutaAlComercio, { destino: DESTINO, nombre: 'Estilo Urbano', onruta });

		await userEvent.click(screen.getByRole('button', { name: 'Cómo llegar a Estilo Urbano' }));

		expect(await screen.findByRole('status')).toHaveTextContent('3,2 km · 8 min en auto');
		expect(onruta).toHaveBeenCalledWith(
			expect.objectContaining({
				geometria: [
					[-35.97, -62.73],
					[-35.98, -62.74]
				],
				origen: [-35.97, -62.73]
			})
		);
	});

	it('si se niega el permiso, lo explica y ofrece Google Maps', async () => {
		conGeolocalizacion(false);
		render(RutaAlComercio, { destino: DESTINO });

		await userEvent.click(screen.getByRole('button', { name: 'Cómo llegar' }));

		const alerta = await screen.findByRole('alert');
		expect(alerta).toHaveTextContent('Necesitamos permiso para usar tu ubicación.');
		expect(screen.getByRole('link', { name: 'Abrir en Google Maps' })).toHaveAttribute(
			'href',
			expect.stringContaining('destination=-35.98%2C-62.74')
		);
	});

	it('si OSRM falla, muestra el error y el respaldo', async () => {
		conGeolocalizacion(true);
		conRuta({}, false);
		render(RutaAlComercio, { destino: DESTINO });

		await userEvent.click(screen.getByRole('button', { name: 'Cómo llegar' }));

		const alerta = await screen.findByRole('alert');
		expect(alerta).toHaveTextContent('El servicio de rutas no está disponible.');
		expect(screen.getByRole('link', { name: 'Abrir en Google Maps' })).toBeInTheDocument();
	});

	it('sin geolocalización en el navegador avisa y no llama a OSRM', async () => {
		Reflect.deleteProperty(navigator, 'geolocation');
		const pedir = conRuta({});
		render(RutaAlComercio, { destino: DESTINO });

		await userEvent.click(screen.getByRole('button', { name: 'Cómo llegar' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('no permite obtener la ubicación');
		expect(pedir).not.toHaveBeenCalled();
	});
});
