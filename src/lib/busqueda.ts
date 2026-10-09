/**
 * Búsqueda inteligente tolerante (RF-07):
 * - insensible a mayúsculas, tildes y espacios extra
 * - expande sinónimos de lenguaje natural ("comida" → gastronomía, ...)
 * - pensada para usarse tanto en el mock (handler) como en el backend real (PostgreSQL
 *   `unaccent` + `ILIKE` o `pg_trgm`).
 */

/** Minúsculas + sin diacríticos + espacios colapsados. */
export function normalizar(texto: string): string {
	return texto
		.toString()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9ñ ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Diccionario de sinónimos en lenguaje natural.
 * Las claves ya están normalizadas (sin tildes).
 */
export const SINONIMOS: Record<string, string[]> = {
	comida: ['gastronomia', 'restaurante', 'bar', 'comer', 'menu'],
	gastronomia: ['gastronomia', 'restaurante', 'comida'],
	restaurante: ['gastronomia', 'restaurante', 'comida', 'bar'],
	peluqueria: ['peluqueria', 'barberia', 'corte', 'pelo', 'peinado', 'color'],
	barberia: ['barberia', 'peluqueria', 'corte', 'barba', 'fade'],
	corte: ['peluqueria', 'barberia', 'corte', 'pelo'],
	pelo: ['peluqueria', 'barberia', 'pelo', 'color'],
	barba: ['barberia', 'barba', 'fade'],
	fade: ['barberia', 'fade', 'corte'],
	gym: ['gimnasio', 'fitness', 'entrenamiento', 'musculacion', 'crossfit', 'funcional'],
	pesas: ['gimnasio', 'fitness', 'entrenamiento', 'musculacion'],
	gimnasio: ['gimnasio', 'fitness', 'entrenamiento', 'gym'],
	fitness: ['gimnasio', 'fitness', 'entrenamiento'],
	entrenamiento: ['gimnasio', 'fitness', 'entrenamiento'],
	crossfit: ['gimnasio', 'crossfit', 'funcional'],
	funcional: ['gimnasio', 'funcional', 'entrenamiento'],
	unas: ['manicuria', 'pedicura', 'nails', 'esculpidas'],
	manicuria: ['manicuria', 'pedicura', 'unas'],
	masajes: ['masaje', 'relax', 'descontracturante', 'spa'],
	masaje: ['masaje', 'masajes', 'spa'],
	dentista: ['odontologia', 'dental'],
	medico: ['salud', 'clinica', 'consultorio'],
	perro: ['veterinaria', 'mascota', 'peluqueria canina'],
	gato: ['veterinaria', 'mascota'],
	kiosco: ['almacen', 'kiosco', '24 horas', 'drugstore'],
	almacen: ['almacen', 'kiosco'],
	ropa: ['indumentaria', 'calzado', 'vestimenta', 'tienda'],
	indumentaria: ['indumentaria', 'ropa', 'calzado'],
	farmacia: ['farmacia', 'medicamento'],
	yoga: ['yoga', 'pilates', 'meditacion'],
	pilates: ['yoga', 'pilates'],
	tatuaje: ['tatuaje', 'tattoo', 'tinta'],
	tattoo: ['tatuaje', 'tattoo']
};

/** Expande una consulta en sus términos + sinónimos (normalizados, sin duplicados). */
export function expandirConsulta(query: string): string[] {
	const base = normalizar(query);
	if (!base) return [];
	const palabras = base.split(' ');
	const terminos = new Set<string>([base, ...palabras]);
	for (const palabra of palabras) {
		const syns = SINONIMOS[palabra];
		if (syns) for (const s of syns) terminos.add(normalizar(s));
	}
	// La consulta completa también puede ser un sinónimo ("comida" sola).
	const synsCompleta = SINONIMOS[base];
	if (synsCompleta) for (const s of synsCompleta) terminos.add(normalizar(s));
	return [...terminos];
}

/** ¿Coincide la empresa con la consulta (tolerante + sinónimos)? */
export function coincideBusqueda(
	empresa: { nombre: string; categoria?: string; etiquetas?: string[]; descripcion?: string },
	query: string
): boolean {
	const q = query.trim();
	if (!q) return true;
	const terminos = expandirConsulta(q);
	const haystack = normalizar(
		[
			empresa.nombre,
			empresa.categoria ?? '',
			(empresa.etiquetas ?? []).join(' '),
			empresa.descripcion ?? ''
		].join(' ')
	);
	return terminos.some((t) => t && haystack.includes(t));
}
