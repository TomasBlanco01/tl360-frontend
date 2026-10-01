import { fechaLocal } from './fechas';

export interface EventoTurno {
	titulo: string;
	fecha: string; // YYYY-MM-DD
	hora: string; // HH:MM
	duracionMin: number;
	lugar: string;
}

// ponytail: interpreta la hora en la zona del navegador; alcanza mientras los usuarios estén en Argentina.
function inicio(e: EventoTurno, sumarMin = 0): Date {
	const d = fechaLocal(e.fecha);
	const [h, m] = e.hora.split(':').map(Number);
	d.setHours(h, m + sumarMin);
	return d;
}

/** Formato UTC de iCalendar: 20261013T123000Z */
const aICS = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function enlaceGoogleCalendar(e: EventoTurno): string {
	const p = new URLSearchParams({
		action: 'TEMPLATE',
		text: e.titulo,
		dates: `${aICS(inicio(e))}/${aICS(inicio(e, e.duracionMin))}`,
		location: e.lugar
	});
	return `https://calendar.google.com/calendar/render?${p}`;
}

export function textoICS(e: EventoTurno, ahora = new Date()): string {
	const esc = (s: string) => s.replace(/([\\,;])/g, '\\$1');
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//TL360//Turnos//ES',
		'BEGIN:VEVENT',
		`UID:${crypto.randomUUID()}@tl360`,
		`DTSTAMP:${aICS(ahora)}`,
		`DTSTART:${aICS(inicio(e))}`,
		`DTEND:${aICS(inicio(e, e.duracionMin))}`,
		`SUMMARY:${esc(e.titulo)}`,
		`LOCATION:${esc(e.lugar)}`,
		'BEGIN:VALARM',
		'TRIGGER:-PT1H',
		'ACTION:DISPLAY',
		'DESCRIPTION:Recordatorio de turno',
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
}

/** Apple Calendar / Outlook: descarga un .ics que el sistema abre con el calendario. */
export function descargarICS(e: EventoTurno) {
	const url = URL.createObjectURL(new Blob([textoICS(e)], { type: 'text/calendar' }));
	const a = Object.assign(document.createElement('a'), { href: url, download: 'turno-tl360.ics' });
	a.click();
	URL.revokeObjectURL(url);
}
