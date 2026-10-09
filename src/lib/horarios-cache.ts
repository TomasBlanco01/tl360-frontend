import type { HorariosPorDia } from '$lib/types';

const TTL_MS = 5 * 60 * 1000;
const MAX_ITEMS = 200;

interface Entrada {
	horarios: HorariosPorDia;
	expira: number;
}

const internas = new Map<number, Entrada>();

function podar(): void {
	if (internas.size <= MAX_ITEMS) return;
	const claves = [...internas.keys()].slice(0, internas.size - MAX_ITEMS);
	for (const k of claves) internas.delete(k);
}

/** Caché compartida entre tarjetas: evita pedir los mismos horarios N veces. */
export const cacheHorarios = {
	get(id: number): HorariosPorDia | undefined {
		const e = internas.get(id);
		if (!e) return undefined;
		if (Date.now() > e.expira) {
			internas.delete(id);
			return undefined;
		}
		return e.horarios;
	},
	set(id: number, horarios: HorariosPorDia): void {
		internas.set(id, { horarios, expira: Date.now() + TTL_MS });
		podar();
	},
	/** Invalida tras PUT /horarios para no mostrar el badge desactualizado. */
	invalidate(id?: number): void {
		if (id === undefined) internas.clear();
		else internas.delete(id);
	},
	/** Solo para tests. */
	_size(): number {
		return internas.size;
	}
};
