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
