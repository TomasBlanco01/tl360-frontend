/**
 * Fechas "de calendario" en hora local. `toISOString()` convierte a UTC: en Argentina (UTC-3)
 * después de las 21 h devuelve el día siguiente, y `new Date('2026-10-13')` es la medianoche UTC,
 * o sea el 12 a las 21 h en Trenque Lauquen.
 */
const dos = (n: number) => String(n).padStart(2, '0');

/** Fecha local en formato YYYY-MM-DD. */
export function hoyISO(ahora = new Date()): string {
	return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

/** "2026-10-13" (o "2026-10-13T…") → Date a la medianoche local de ese día. */
export function fechaLocal(iso: string): Date {
	const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
	return new Date(a, m - 1, d);
}

export function sumarDias(iso: string, n: number): string {
	const d = fechaLocal(iso);
	d.setDate(d.getDate() + n);
	return hoyISO(d);
}
