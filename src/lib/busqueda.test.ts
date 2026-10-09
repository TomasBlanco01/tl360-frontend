import { describe, expect, it } from 'vitest';
import { coincideBusqueda, expandirConsulta, normalizar } from './busqueda';

describe('normalizar', () => {
	it('ignora mayúsculas, tildes y espacios', () => {
		expect(normalizar('Peluquería')).toBe('peluqueria');
		expect(normalizar('  GIMNASIO   Fuerte ')).toBe('gimnasio fuerte');
	});
});

describe('expandirConsulta', () => {
	it('expande sinónimos de lenguaje natural', () => {
		expect(expandirConsulta('comida')).toContain('gastronomia');
		expect(expandirConsulta('gym')).toContain('gimnasio');
		expect(expandirConsulta('peluqueria')).toContain('barberia');
	});
	it('consulta vacía no expande', () => {
		expect(expandirConsulta('   ')).toEqual([]);
	});
});

describe('coincideBusqueda', () => {
	const pelu = { nombre: 'Estilo Urbano Peluquería', categoria: 'Peluquería' };
	const gym = { nombre: 'PowerFit', categoria: 'Gimnasio', etiquetas: ['Crossfit'] };
	const resto = { nombre: 'Lo de Juan', categoria: 'Gastronomía' };

	it('tolera tildes y mayúsculas', () => {
		expect(coincideBusqueda(pelu, 'peluqueria')).toBe(true);
		expect(coincideBusqueda(pelu, 'PELUQUERÍA')).toBe(true);
	});
	it('relaciona sinónimos', () => {
		expect(coincideBusqueda(resto, 'comida')).toBe(true);
		expect(coincideBusqueda(pelu, 'corte')).toBe(true);
		expect(coincideBusqueda(gym, 'gym')).toBe(true);
		expect(coincideBusqueda(gym, 'pesas')).toBe(true);
	});
	it('busca en etiquetas', () => {
		expect(coincideBusqueda(gym, 'crossfit')).toBe(true);
	});
	it('no da falsos positivos', () => {
		expect(coincideBusqueda(pelu, 'veterinaria')).toBe(false);
	});
	it('vacío coincide con todo', () => {
		expect(coincideBusqueda(pelu, '')).toBe(true);
	});
});
