import { formatearDistancia } from './geo';

export interface RutaCalculada {
	/** Distancia por calle en kilómetros. */
	distanciaKm: number;
	/** Duración estimada en minutos (automóvil). */
	duracionMin: number;
	/** Puntos [lat, lng] listos para dibujar con Leaflet. */
	geometria: [number, number][];
	/** Posición del usuario que originó la ruta. */
	origen: [number, number];
}

interface RespuestaOsrm {
	code?: string;
	routes?: {
		distance: number;
		duration: number;
		geometry?: { coordinates?: [number, number][] };
	}[];
}

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

export function esCoordenadaValida(punto: [number, number]): boolean {
	const [lat, lng] = punto;
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		lat >= -90 &&
		lat <= 90 &&
		lng >= -180 &&
		lng <= 180
	);
}

/** "8 min", "1 h", "1 h 5 min". */
export function formatearDuracion(minutos: number): string {
	const total = Math.max(1, Math.round(minutos));
	if (total < 60) return `${total} min`;
	const horas = Math.floor(total / 60);
	const resto = total % 60;
	return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/** Enlace de respaldo para abrir el recorrido en Google Maps. */
export function enlaceIndicaciones(destino: [number, number], origen?: [number, number]): string {
	const params = new URLSearchParams({
		api: '1',
		destination: `${destino[0]},${destino[1]}`,
		travelmode: 'driving'
	});
	if (origen) params.set('origin', `${origen[0]},${origen[1]}`);
	return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Pide a OSRM la ruta en auto entre dos puntos [lat, lng].
 * OSRM devuelve geometría GeoJSON [lng, lat]; acá se invierte para Leaflet.
 */
export async function calcularRuta(
	desde: [number, number],
	hasta: [number, number],
	opciones: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<RutaCalculada> {
	if (!esCoordenadaValida(desde) || !esCoordenadaValida(hasta)) {
		throw new Error('Las coordenadas de la ruta no son válidas.');
	}
	const url = `${OSRM}/${desde[1]},${desde[0]};${hasta[1]},${hasta[0]}?overview=full&geometries=geojson`;
	const pedir = opciones.fetch ?? fetch;
	const respuesta = await pedir(url, { signal: opciones.signal });
	if (!respuesta.ok) {
		throw new Error('El servicio de rutas no está disponible.');
	}
	const datos = (await respuesta.json()) as RespuestaOsrm;
	const ruta = datos.routes?.[0];
	const coordenadas = ruta?.geometry?.coordinates;
	if (datos.code !== 'Ok' || !ruta || !coordenadas?.length) {
		throw new Error('No encontramos una ruta en auto hasta el comercio.');
	}
	return {
		distanciaKm: ruta.distance / 1000,
		duracionMin: Math.max(1, Math.round(ruta.duration / 60)),
		geometria: coordenadas.map(([lng, lat]) => [lat, lng]),
		origen: desde
	};
}

export function resumenRuta(ruta: RutaCalculada): string {
	return `${formatearDistancia(ruta.distanciaKm)} · ${formatearDuracion(ruta.duracionMin)} en auto`;
}
