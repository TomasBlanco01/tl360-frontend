export const FERIADOS = [
	'2025-01-01',
	'2025-02-12',
	'2025-03-24',
	'2025-04-18',
	'2025-05-01',
	'2025-05-25',
	'2025-06-20',
	'2025-07-09',
	'2025-12-25'
];

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Días de la semana en el orden en que se muestran (Lunes a Domingo). */
export const DIAS_ORDEN = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function nombreDia(fechaISO: string): string {
	const [a, m, d] = fechaISO.split('-').map(Number);
	return DIAS[new Date(a, m - 1, d).getDay()];
}

export interface GrupoHorario {
	/** Ej. "Lunes a Viernes", o "Sábado" si es un solo día. */
	etiqueta: string;
	/** Vacío = cerrado ese/esos días. */
	rangos: string[];
}

/** Agrupa días consecutivos con exactamente los mismos horarios en un solo renglón. */
export function agruparHorarios(horarios: Record<string, string[]>): GrupoHorario[] {
	const grupos: { dias: string[]; rangos: string[] }[] = [];
	for (const dia of DIAS_ORDEN) {
		const rangos = horarios[dia] ?? [];
		const anterior = grupos.at(-1);
		if (anterior && anterior.rangos.join(',') === rangos.join(',')) anterior.dias.push(dia);
		else grupos.push({ dias: [dia], rangos });
	}
	return grupos.map(({ dias, rangos }) => ({
		etiqueta: dias.length === 1 ? dias[0] : `${dias[0]} a ${dias.at(-1)}`,
		rangos
	}));
}

/** Horarios de una franja "HH:MM-HH:MM": arrancan al inicio y avanzan de a `pasoMin`; el último debe terminar antes del cierre. */
export function generarSlots(rango: string, pasoMin = 30): string[] {
	const [inicio, fin] = rango.split('-');
	const aMin = (hora: string) => {
		const [h, m] = hora.split(':').map(Number);
		return h * 60 + m;
	};
	const slots: string[] = [];
	for (let m = aMin(inicio); m + pasoMin <= aMin(fin); m += pasoMin) {
		slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
	}
	return slots;
}

/**
 * Slots disponibles para una fecha, según los horarios (por día) y la duración del turno del comercio.
 * La grilla es la misma que valida el backend al reservar (POST /turnos/reservar).
 */
export function slotsDelDia(
	fechaISO: string,
	horarios: Record<string, string[]>,
	pasoMin = 30
): string[] {
	if (!fechaISO) return [];

	const dia = nombreDia(fechaISO);
	if (FERIADOS.includes(fechaISO)) return [];

	const rangos = horarios[dia] || [];
	let todos: string[] = [];
	rangos.forEach((r) => (todos = [...todos, ...generarSlots(r, pasoMin)]));

	const hoyISO = new Date().toISOString().split('T')[0];
	if (fechaISO === hoyISO) {
		const horaActual = new Date().toTimeString().slice(0, 5);
		todos = todos.filter((hora) => hora > horaActual);
	}

	return todos;
}

/** Determina si un comercio está abierto ahora mismo, según sus horarios semanales. */
export function estaAbiertoAhora(horarios: Record<string, string[]>): boolean {
	const ahora = new Date();
	const hoyISO = ahora.toISOString().split('T')[0];
	const dia = nombreDia(hoyISO);
	const horaActual = ahora.toTimeString().slice(0, 5);

	const rangos = horarios[dia] || [];
	return rangos.some((r) => {
		const [inicio, fin] = r.split('-');
		return horaActual >= inicio && horaActual < fin;
	});
}
