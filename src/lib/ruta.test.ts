import { describe, expect, it, vi } from 'vitest';
import {
	calcularRuta,
	enlaceIndicaciones,
	esCoordenadaValida,
	formatearDuracion,
	resumenRuta
} from './ruta';

type FetchMock = typeof fetch & { mock: { calls: [string][] } };

function osrm(cuerpo: unknown, ok = true): FetchMock {
	return vi.fn().mockResolvedValue({ ok, json: async () => cuerpo }) as unknown as FetchMock;
}

describe('calcularRuta (OSRM)', () => {
	it('invierte la geometría a [lat, lng] y resume distancia y duración', async () => {
		const pedir = osrm({
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
		const ruta = await calcularRuta([-35.97, -62.73], [-35.98, -62.74], { fetch: pedir });

		expect(ruta.distanciaKm).toBeCloseTo(3.21);
		expect(ruta.duracionMin).toBe(8);
		expect(ruta.geometria).toEqual([
			[-35.97, -62.73],
			[-35.98, -62.74]
		]);
		expect(ruta.origen).toEqual([-35.97, -62.73]);
		expect(pedir.mock.calls[0][0]).toContain('/-62.73,-35.97;-62.74,-35.98');
		expect(resumenRuta(ruta)).toBe('3,2 km · 8 min en auto');
	});

	it('rechaza coordenadas inválidas sin llamar a la red', async () => {
		const pedir = osrm({});
		await expect(calcularRuta([200, 10], [-35.98, -62.74], { fetch: pedir })).rejects.toThrow(
			'coordenadas'
		);
		expect(pedir).not.toHaveBeenCalled();
	});

	it('falla si el servicio responde con error', async () => {
		const pedir = osrm({}, false);
		await expect(
			calcularRuta([-35.97, -62.73], [-35.98, -62.74], { fetch: pedir })
		).rejects.toThrow('servicio de rutas');
	});

	it('falla si OSRM no devuelve una ruta', async () => {
		const pedir = osrm({ code: 'NoRoute', routes: [] });
		await expect(
			calcularRuta([-35.97, -62.73], [-35.98, -62.74], { fetch: pedir })
		).rejects.toThrow('No encontramos una ruta');
	});

	it('valida el rango de latitud y longitud', () => {
		expect(esCoordenadaValida([-35.97, -62.73])).toBe(true);
		expect(esCoordenadaValida([91, 0])).toBe(false);
		expect(esCoordenadaValida([0, 181])).toBe(false);
		expect(esCoordenadaValida([Number.NaN, 0])).toBe(false);
	});
});

describe('formatearDuracion', () => {
	it('muestra minutos u horas', () => {
		expect(formatearDuracion(8)).toBe('8 min');
		expect(formatearDuracion(60)).toBe('1 h');
		expect(formatearDuracion(65)).toBe('1 h 5 min');
		expect(formatearDuracion(0.2)).toBe('1 min');
	});
});

describe('enlaceIndicaciones', () => {
	it('arma un enlace de Google Maps con destino y origen opcional', () => {
		const sinOrigen = enlaceIndicaciones([-35.98, -62.74]);
		expect(sinOrigen).toContain('google.com/maps/dir/');
		expect(sinOrigen).toContain('destination=-35.98%2C-62.74');
		expect(sinOrigen).not.toContain('origin=');

		const conOrigen = enlaceIndicaciones([-35.98, -62.74], [-35.97, -62.73]);
		expect(conOrigen).toContain('origin=-35.97%2C-62.73');
	});
});
