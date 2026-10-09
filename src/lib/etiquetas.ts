/**
 * Catálogo estandarizado de etiquetas de accesibilidad y servicios (RF-18).
 * En PostgreSQL serán una tabla `etiquetas` + `empresa_etiquetas` (N-N);
 * en el mock se guardan como `string[]` en `Empresa.etiquetas`.
 */

export const CATALOGO_ETIQUETAS = [
	'Rampa de acceso',
	'Baño adaptado',
	'Apto celíacos',
	'Acepta mascotas',
	'Wi-Fi gratis'
] as const;

export type EtiquetaCatalogo = (typeof CATALOGO_ETIQUETAS)[number];

/** Normaliza una etiqueta para comparar en URLs (?etiquetas=rampa,wifi). */
export function normalizarEtiqueta(etiqueta: string): string {
	return etiqueta
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]/g, '');
}

/** Parsea `?etiquetas=a,b` a lista de etiquetas del catálogo (ignora desconocidas). */
export function parsearEtiquetasParam(param: string | null): string[] {
	if (!param) return [];
	const pedidas = param
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return pedidas.filter((p) =>
		CATALOGO_ETIQUETAS.some(
			(c) =>
				normalizarEtiqueta(c) === normalizarEtiqueta(p) ||
				normalizarEtiqueta(c).includes(normalizarEtiqueta(p)) ||
				normalizarEtiqueta(p).includes(normalizarEtiqueta(c))
		)
	);
}

/** Resuelve lo que el usuario escribió/seleccionó a la etiqueta canónica del catálogo. */
export function aEtiquetaCanoncia(valor: string): string {
	const n = normalizarEtiqueta(valor);
	const hit = CATALOGO_ETIQUETAS.find(
		(c) =>
			normalizarEtiqueta(c) === n ||
			normalizarEtiqueta(c).includes(n) ||
			n.includes(normalizarEtiqueta(c))
	);
	return hit ?? valor;
}
