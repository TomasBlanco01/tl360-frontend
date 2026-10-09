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

/**
 * Clustering liviano sin dependencias: agrupa puntos cercanos en una grilla
 * cuya celda depende del zoom. zoom>=15 → ~100m, >=13 → ~500m, si no → ~1km.
 * Evita cientos de circleMarkers superpuestos en el directorio.
 */
export function agruparPuntos<T extends { lat: number; lng: number }>(
	puntos: T[],
	zoom = 14
): GrupoMapa<T>[] {
	const paso = zoom >= 15 ? 0.001 : zoom >= 13 ? 0.005 : 0.01;
	const celdas = new Map<string, T[]>();
	for (const p of puntos) {
		const key = `${Math.round(p.lat / paso)}:${Math.round(p.lng / paso)}`;
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

/** Escapa texto para interpolar seguro dentro de un popup Leaflet (HTML string). */
export function escaparHtml(texto: string): string {
	return texto
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
