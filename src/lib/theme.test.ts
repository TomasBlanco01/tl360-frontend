import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, BRAND_STOPS, generarEscala, generarSecundario } from './theme';

const HEX = /^#[0-9a-f]{6}$/;

/** Luminosidad percibida aproximada de un color hex. */
const luz = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

describe('generarEscala', () => {
	it.each(ACCENT_PRESETS.map((p) => [p.label, p.hex]))(
		'genera todos los tonos válidos para %s',
		(_n, hex) => {
			const escala = generarEscala(hex);
			expect(Object.keys(escala).map(Number)).toEqual([...BRAND_STOPS]);
			for (const stop of BRAND_STOPS) expect(escala[stop]).toMatch(HEX);
		}
	);

	it.each(ACCENT_PRESETS.map((p) => [p.label, p.hex]))(
		'%s: va de claro a oscuro sin saltos al revés',
		(_n, hex) => {
			const escala = generarEscala(hex);
			const luces = BRAND_STOPS.map((s) => luz(escala[s]));
			for (let i = 1; i < luces.length; i++) expect(luces[i]).toBeLessThan(luces[i - 1]);
		}
	);

	it('el tono 500 conserva el color elegido', () => {
		expect(generarEscala('#7e57c2')[500]).toBe('#7e57c2');
		expect(generarEscala('#009688')[500]).toBe('#009688');
	});

	it('acepta hex abreviado y grises sin romperse', () => {
		expect(generarEscala('#fff')[500]).toMatch(HEX);
		expect(generarEscala('#808080')[50]).toMatch(HEX);
	});
});

describe('generarSecundario', () => {
	it('deriva un color distinto del principal', () => {
		for (const p of ACCENT_PRESETS) {
			const principal = generarEscala(p.hex);
			const secundario = generarSecundario(p.hex);
			expect(secundario[500]).toMatch(HEX);
			expect(secundario[500]).not.toBe(principal[500]);
		}
	});
});

describe('ACCENT_PRESETS', () => {
	it('tiene ids y colores únicos', () => {
		expect(new Set(ACCENT_PRESETS.map((p) => p.id)).size).toBe(ACCENT_PRESETS.length);
		expect(new Set(ACCENT_PRESETS.map((p) => p.hex)).size).toBe(ACCENT_PRESETS.length);
	});
});
