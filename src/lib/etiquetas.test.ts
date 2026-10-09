import { describe, expect, it } from 'vitest';
import { aEtiquetaCanoncia, CATALOGO_ETIQUETAS, parsearEtiquetasParam } from './etiquetas';

describe('catálogo de etiquetas', () => {
	it('tiene las 5 etiquetas del plan', () => {
		expect([...CATALOGO_ETIQUETAS]).toEqual([
			'Rampa de acceso',
			'Baño adaptado',
			'Apto celíacos',
			'Acepta mascotas',
			'Wi-Fi gratis'
		]);
	});
});

describe('parsearEtiquetasParam', () => {
	it('null o vacío da lista vacía', () => {
		expect(parsearEtiquetasParam(null)).toEqual([]);
		expect(parsearEtiquetasParam('')).toEqual([]);
	});
	it('acepta formas cortas tipo ?etiquetas=rampa,wifi', () => {
		const res = parsearEtiquetasParam('rampa,wifi');
		expect(res).toHaveLength(2);
	});
	it('ignora etiquetas desconocidas', () => {
		expect(parsearEtiquetasParam('rampa,xyz-inventado')).toHaveLength(1);
	});
});

describe('aEtiquetaCanoncia', () => {
	it('resuelve a la canónica del catálogo', () => {
		expect(aEtiquetaCanoncia('rampa')).toBe('Rampa de acceso');
		expect(aEtiquetaCanoncia('Wi-Fi gratis')).toBe('Wi-Fi gratis');
	});
	it('si no la conoce la deja igual', () => {
		expect(aEtiquetaCanoncia('Terraza')).toBe('Terraza');
	});
});
