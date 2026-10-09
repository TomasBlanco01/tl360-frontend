/**
 * Slugs amigables para SEO y para compartir por WhatsApp.
 * `/comercios/estilo-urbano-peluqueria` en lugar de `/comercios/1`.
 * El backend (PostgreSQL) los guardará como columna `slug UNIQUE`;
 * el mock los genera a partir del nombre + id para evitar colisiones.
 */

export function slugify(text: string): string {
	return text
		.toString()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.replace(/[^a-z0-9 -]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
}

/** Slug estable para un comercio: nombre slugificado. Si ya existe, se sufija con el id. */
export function slugParaEmpresa(
	nombre: string,
	id: number,
	existentes = new Set<string>()
): string {
	const base = slugify(nombre) || `comercio-${id}`;
	if (!existentes.has(base)) return base;
	return `${base}-${id}`;
}

/** URL pública de la ficha: prefiere slug, cae a id numérico (compat con datos viejos). */
export function urlEmpresa(empresa: { id: number; slug?: string }): string {
	return `/comercios/${empresa.slug || empresa.id}`;
}

/** URL del turnero del comercio. */
export function urlReservar(empresa: { id: number; slug?: string }): string {
	return `/comercios/${empresa.slug || empresa.id}/reservar`;
}

/**
 * Resuelve un parámetro de ruta `[id]` que puede ser id numérico o slug.
 * Devuelve el criterio de búsqueda para el mock / backend.
 */
export function esIdNumerico(param: string): boolean {
	return /^\d+$/.test(param.trim());
}
