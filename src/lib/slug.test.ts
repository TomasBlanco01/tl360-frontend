import { describe, expect, it } from 'vitest';
import { esIdNumerico, slugify, slugParaEmpresa, urlEmpresa, urlReservar } from './slug';

describe('slugify', () => {
	it('convierte a minúsculas con guiones', () => {
		expect(slugify('Estilo Urbano Peluquería')).toBe('estilo-urbano-peluqueria');
	});
	it('quita acentos, signos y espacios extra', () => {
		expect(slugify('  Bar & Barbería  Dorrego!! ')).toBe('bar-barberia-dorrego');
	});
	it('colapsa guiones repetidos', () => {
		expect(slugify('Kiosco   24hs   Centro')).toBe('kiosco-24hs-centro');
	});
	it('texto vacío no rompe', () => {
		expect(slugify('')).toBe('');
	});
});

describe('slugParaEmpresa', () => {
	it('usa el nombre slugificado', () => {
		expect(slugParaEmpresa('PowerFit Trenque', 3)).toBe('powerfit-trenque');
	});
	it('si el slug ya existe, sufija con el id', () => {
		expect(slugParaEmpresa('Bar', 9, new Set(['bar']))).toBe('bar-9');
	});
	it('sin nombre usa el id', () => {
		expect(slugParaEmpresa('', 5)).toBe('comercio-5');
	});
});

describe('urls', () => {
	it('prefiere el slug y cae al id', () => {
		expect(urlEmpresa({ id: 1, slug: 'estilo-urbano-peluqueria' })).toBe(
			'/comercios/estilo-urbano-peluqueria'
		);
		expect(urlEmpresa({ id: 1 })).toBe('/comercios/1');
		expect(urlReservar({ id: 7, slug: 'x' })).toBe('/comercios/x/reservar');
	});
});

describe('esIdNumerico', () => {
	it('distingue ids de slugs', () => {
		expect(esIdNumerico('7')).toBe(true);
		expect(esIdNumerico('estilo-urbano')).toBe(false);
		expect(esIdNumerico(' 12 ')).toBe(true);
	});
});
