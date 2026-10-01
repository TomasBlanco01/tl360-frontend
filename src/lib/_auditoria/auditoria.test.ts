import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { hoyISO, fechaLocal, sumarDias } from './fechas';
import { textoICS, enlaceGoogleCalendar } from './ics';
import SelectorDias from './SelectorDias.svelte';

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

describe('calendario', () => {
	const e = { titulo: 'Turno', fecha: '2026-10-13', hora: '09:30', duracionMin: 45, lugar: 'Villegas 482' };
	it('el .ics dura lo que el turno y avisa una hora antes', () => {
		const ics = textoICS(e);
		const ini = ics.match(/DTSTART:(\d{8}T\d{6}Z)/)![1];
		const fin = ics.match(/DTEND:(\d{8}T\d{6}Z)/)![1];
		const aMs = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13));
		expect(aMs(fin) - aMs(ini)).toBe(45 * 60_000);
		expect(ics).toContain('TRIGGER:-PT1H');
	});
	it('el enlace de Google Calendar lleva título y lugar', () => {
		const url = new URL(enlaceGoogleCalendar(e));
		expect(url.searchParams.get('text')).toBe('Turno');
		expect(url.searchParams.get('location')).toBe('Villegas 482');
	});
});

describe('selector de días', () => {
	it('deshabilita los días sin horario', () => {
		render(SelectorDias, { horarios: { Lunes: ['09:00-12:00'] } });
		const dias = screen.getAllByRole('radio');
		expect(dias).toHaveLength(14);
		expect(dias.filter((d) => !(d as HTMLButtonElement).disabled)).toHaveLength(2);
	});
});
