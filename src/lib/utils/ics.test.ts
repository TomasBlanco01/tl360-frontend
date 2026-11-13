import { describe, expect, it } from 'vitest';
import { enlaceGoogleCalendar, textoICS } from './ics';

const e = {
	id: 42,
	titulo: 'Turno en Peluquería Central',
	fecha: '2026-10-13',
	hora: '09:30:00',
	duracionMin: 45,
	lugar: 'Villegas 482, Trenque Lauquen'
};

describe('calendario', () => {
	it('el turno empieza a la hora del comercio (UTC-3) y dura lo configurado', () => {
		const ics = textoICS(e);
		expect(ics).toContain('DTSTART:20261013T123000Z');
		expect(ics).toContain('DTEND:20261013T131500Z');
	});

	it('avisa una hora antes y usa un UID estable por turno', () => {
		const ics = textoICS(e);
		expect(ics).toContain('TRIGGER:-PT1H');
		expect(ics).toContain('UID:turno-42@tl360');
		expect(textoICS(e)).toContain('UID:turno-42@tl360');
	});

	it('escapa comas, punto y coma y saltos de línea', () => {
		const ics = textoICS({ ...e, descripcion: 'Traer DNI; llegar 5 min antes\nGracias' });
		expect(ics).toContain('LOCATION:Villegas 482\\, Trenque Lauquen');
		expect(ics).toContain('DESCRIPTION:Traer DNI\\; llegar 5 min antes\\nGracias');
	});

	it('usa CRLF como pide el formato', () => {
		expect(textoICS(e).split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
	});

	it('el enlace de Google Calendar lleva título, horario y lugar', () => {
		const url = new URL(enlaceGoogleCalendar(e));
		expect(url.searchParams.get('text')).toBe('Turno en Peluquería Central');
		expect(url.searchParams.get('dates')).toBe('20261013T123000Z/20261013T131500Z');
		expect(url.searchParams.get('location')).toBe('Villegas 482, Trenque Lauquen');
	});
});
