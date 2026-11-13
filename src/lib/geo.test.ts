import { describe, expect, it } from 'vitest';
import {
	agruparEnPantalla,
	dentroDeLimites,
	distanciaKm,
	escaparHtml,
	formatearDistancia
} from './geo';

describe('distanciaKm', () => {
	it('es 0 entre el mismo punto', () => {
		expect(distanciaKm([-35.97, -62.73], [-35.97, -62.73])).toBe(0);
	});

	it('un grado de latitud son ~111 km', () => {
		expect(distanciaKm([0, 0], [1, 0])).toBeCloseTo(111.19, 1);
	});

	it('Trenque Lauquen - Pehuajó ronda los 70 km', () => {
		const km = distanciaKm([-35.9711, -62.7333], [-35.8108, -61.8971]);
		expect(km).toBeGreaterThan(70);
		expect(km).toBeLessThan(85);
	});

	it('es simétrica', () => {
		const a: [number, number] = [-35.97, -62.73];
		const b: [number, number] = [-36.1, -62.5];
		expect(distanciaKm(a, b)).toBeCloseTo(distanciaKm(b, a), 10);
	});
});

describe('formatearDistancia', () => {
	it('en metros por debajo del kilómetro, redondeado a la decena', () => {
		expect(formatearDistancia(0.354)).toBe('350 m');
		expect(formatearDistancia(0.05)).toBe('50 m');
	});

	it('en kilómetros con coma decimal desde 1 km', () => {
		expect(formatearDistancia(1.24)).toBe('1,2 km');
		expect(formatearDistancia(12)).toBe('12,0 km');
	});
});

describe('escaparHtml', () => {
	it('escapa caracteres para popup seguro', () => {
		expect(escaparHtml('<b>"x"&\'y\'</b>')).toBe(
			'&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;'
		);
	});
});

describe('agruparEnPantalla', () => {
	// Proyección de juguete: 1 grado = 1000 px multiplicado por el "zoom".
	const proyeccion = (zoom: number) => (lat: number, lng: number) => ({
		x: lng * 1000 * zoom,
		y: -lat * 1000 * zoom
	});
	const pts = [
		{ id: 1, lat: -35.97, lng: -62.73 },
		{ id: 2, lat: -35.9701, lng: -62.7301 },
		{ id: 3, lat: -35.99, lng: -62.75 }
	];

	it('alejado agrupa y acercándose separa cada punto', () => {
		expect(agruparEnPantalla(pts, proyeccion(1), 56)).toHaveLength(1);
		expect(agruparEnPantalla(pts, proyeccion(10), 56)).toHaveLength(2);
		expect(agruparEnPantalla(pts, proyeccion(1000), 56)).toHaveLength(3);
	});

	it('sin celda (zoom máximo) no agrupa puntos separados', () => {
		expect(agruparEnPantalla(pts, proyeccion(1000), 0)).toHaveLength(3);
	});

	it('sin celda junta solo los que comparten ubicación (para abrirlos en abanico)', () => {
		const mismaDireccion = [...pts, { id: 4, lat: -35.99, lng: -62.75 }];
		const grupos = agruparEnPantalla(mismaDireccion, proyeccion(1000), 0);
		expect(grupos).toHaveLength(3);
		expect(grupos.find((g) => g.items.length === 2)?.items.map((p) => p.id)).toEqual([3, 4]);
	});
});

describe('dentroDeLimites', () => {
	it('incluye los puntos del recuadro y deja afuera el resto', () => {
		const limites: [number, number, number, number] = [-36, -62.8, -35.9, -62.7];
		expect(dentroDeLimites({ lat: -35.97, lng: -62.73 }, limites)).toBe(true);
		expect(dentroDeLimites({ lat: -35.8, lng: -62.73 }, limites)).toBe(false);
	});
});
