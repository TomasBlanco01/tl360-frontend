/** Distancia en km entre dos puntos [lat, lng] (fórmula de haversine). */
export function distanciaKm(a: [number, number], b: [number, number]): number {
	const R = 6371;
	const rad = (g: number) => (g * Math.PI) / 180;
	const dLat = rad(b[0] - a[0]);
	const dLng = rad(b[1] - a[1]);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** "350 m" por debajo del kilómetro, "1,2 km" por encima. */
export function formatearDistancia(km: number): string {
	if (km < 1) return `${Math.round(km * 100) * 10} m`;
	return `${km.toFixed(1).replace('.', ',')} km`;
}

export interface GrupoMapa<T extends { lat: number; lng: number }> {
	lat: number;
	lng: number;
	items: T[];
}

/** Escapa texto para interpolar seguro dentro de un popup Leaflet (HTML string). */
export function escaparHtml(texto: string): string {
	return texto
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Clustering por pantalla: agrupa los puntos que caen a menos de `celdaPx` píxeles entre sí con el
 * zoom actual (la proyección la da Leaflet). Se recalcula en cada zoom: alejado agrupa, y al
 * acercarse los grupos se abren hasta mostrar cada comercio en su ubicación real.
 * Con `celdaPx <= 0` (zoom máximo) no agrupa.
 */
export function agruparEnPantalla<T extends { lat: number; lng: number }>(
	puntos: T[],
	proyectar: (lat: number, lng: number) => { x: number; y: number },
	celdaPx = 56
): GrupoMapa<T>[] {
	const celdas = new Map<string, T[]>();
	for (const p of puntos) {
		const { x, y } = proyectar(p.lat, p.lng);
		// Sin agrupar (celda 0) igual se juntan los que caen en el mismo píxel: comparten
		// dirección y el mapa los abre en abanico para poder tocar cada uno.
		const key =
			celdaPx <= 0
				? `${Math.round(x)}:${Math.round(y)}`
				: `${Math.floor(x / celdaPx)}:${Math.floor(y / celdaPx)}`;
		const g = celdas.get(key);
		if (g) g.push(p);
		else celdas.set(key, [p]);
	}
	return [...celdas.values()].map((items) => ({
		lat: items.reduce((s, p) => s + p.lat, 0) / items.length,
		lng: items.reduce((s, p) => s + p.lng, 0) / items.length,
		items
	}));
}

/** Límites visibles del mapa: [sur, oeste, norte, este]. */
export type Limites = [number, number, number, number];

export function dentroDeLimites(p: { lat: number; lng: number }, [s, o, n, e]: Limites): boolean {
	return p.lat >= s && p.lat <= n && p.lng >= o && p.lng <= e;
}
