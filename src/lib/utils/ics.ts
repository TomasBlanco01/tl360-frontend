/** Exportar un turno al calendario del usuario: Google Calendar (enlace) o .ics (Apple, Outlook, etc.). */

export interface EventoTurno {
	/** Identifica el turno: con el mismo UID, volver a importar actualiza el evento en vez de duplicarlo. */
	id: number | string;
	titulo: string;
	fecha: string; // YYYY-MM-DD
	hora: string; // HH:MM o HH:MM:SS
	duracionMin: number;
	lugar: string;
	descripcion?: string;
}

/** Los comercios están en Argentina (UTC-3, sin horario de verano): la hora del turno es la del
 *  comercio, aunque el usuario abra la app desde otra zona horaria. */
const ZONA_COMERCIOS = '-03:00';

function instante(e: EventoTurno, sumarMin = 0): Date {
	const d = new Date(`${e.fecha}T${e.hora.slice(0, 5)}:00${ZONA_COMERCIOS}`);
	return new Date(d.getTime() + sumarMin * 60_000);
}

/** Formato UTC de iCalendar: 20261013T123000Z */
const aICS = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escapa texto según RFC 5545 (barra, coma, punto y coma y saltos de línea). */
const esc = (s: string) => s.replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n');

export function enlaceGoogleCalendar(e: EventoTurno): string {
	const p = new URLSearchParams({
		action: 'TEMPLATE',
		text: e.titulo,
		dates: `${aICS(instante(e))}/${aICS(instante(e, e.duracionMin))}`,
		location: e.lugar
	});
	if (e.descripcion) p.set('details', e.descripcion);
	return `https://calendar.google.com/calendar/render?${p}`;
}

export function textoICS(e: EventoTurno, ahora = new Date()): string {
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//TL360//Turnos//ES',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:turno-${e.id}@tl360`,
		`DTSTAMP:${aICS(ahora)}`,
		`DTSTART:${aICS(instante(e))}`,
		`DTEND:${aICS(instante(e, e.duracionMin))}`,
		`SUMMARY:${esc(e.titulo)}`,
		`LOCATION:${esc(e.lugar)}`,
		...(e.descripcion ? [`DESCRIPTION:${esc(e.descripcion)}`] : []),
		'BEGIN:VALARM',
		'TRIGGER:-PT1H',
		'ACTION:DISPLAY',
		'DESCRIPTION:Recordatorio de turno',
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR',
		''
	].join('\r\n');
}

/** Descarga un .ics que el sistema abre con su calendario (Apple Calendar, Outlook, etc.). */
export function descargarICS(e: EventoTurno) {
	const url = URL.createObjectURL(new Blob([textoICS(e)], { type: 'text/calendar;charset=utf-8' }));
	const a = Object.assign(document.createElement('a'), {
		href: url,
		download: `turno-${e.fecha}.ics`
	});
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Algunos navegadores leen el blob después del click: se libera un rato más tarde.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
