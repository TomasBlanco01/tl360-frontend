import { describe, expect, it } from 'vitest';
import { agruparPuntos, distanciaKm, escaparHtml, formatearDistancia } from './geo';

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

describe('agruparPuntos', () => {
	it('agrupa puntos cercanos y deja solos a los lejanos', () => {
		const grupos = agruparPuntos(
			[
				{ lat: -35.9711, lng: -62.7333 },
				{ lat: -35.9712, lng: -62.7334 },
				{ lat: -35.9, lng: -62.6 }
			],
			14
		);
		expect(grupos).toHaveLength(2);
		expect(grupos.map((g) => g.items.length).sort()).toEqual([1, 2]);
	});

	it('a más zoom, menos agrupación', () => {
		const pts = [
			{ lat: -35.9711, lng: -62.7333 },
			{ lat: -35.9725, lng: -62.7345 }
		];
		expect(agruparPuntos(pts, 12)).toHaveLength(1);
		expect(agruparPuntos(pts, 16)).toHaveLength(2);
	});
});

describe('escaparHtml', () => {
	it('escapa caracteres para popup seguro', () => {
		expect(escaparHtml('<b>"x"&\'y\'</b>')).toBe(
			'&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;'
		);
	});
});
