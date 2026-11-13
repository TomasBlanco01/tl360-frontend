import { describe, expect, it } from 'vitest';
import { hoyISO, fechaLocal, sumarDias } from './fechas';

describe('fechas locales', () => {
	it('a las 22:30 sigue siendo hoy (toISOString daría mañana en UTC-3)', () => {
		expect(hoyISO(new Date(2026, 9, 13, 22, 30))).toBe('2026-10-13');
	});
	it('"2026-10-13" es el 13, no el 12', () => {
		expect(fechaLocal('2026-10-13').getDate()).toBe(13);
	});
	it('suma días cruzando mes', () => {
		expect(sumarDias('2026-10-30', 3)).toBe('2026-11-02');
	});
});
