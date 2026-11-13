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
	comida: [
		'comida',
		'gastronomia',
		'restaurante',
		'bar',
		'rotiseria',
		'pizzeria',
		'parrilla',
		'cafeteria',
		'catering',
		'pastas'
	],
	comidas: ['comida', 'gastronomia', 'restaurante', 'bar', 'rotiseria', 'pizzeria', 'parrilla'],
	comer: ['comida', 'gastronomia', 'restaurante', 'bar', 'rotiseria', 'pizzeria', 'parrilla'],
	gastronomia: ['gastronomia', 'restaurante', 'comida'],
	restaurante: ['gastronomia', 'restaurante', 'comida', 'bar', 'parrilla'],
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
	perro: ['veterinaria'],
	perros: ['veterinaria'],
	gato: ['veterinaria'],
	gatos: ['veterinaria'],
	carne: ['carniceria', 'frigorifico'],
	carnes: ['carniceria', 'frigorifico'],
	asado: ['carniceria', 'frigorifico'],
	pizza: ['pizzeria', 'gastronomia'],
	pizzas: ['pizzeria', 'gastronomia'],
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

/** Palabras que no aportan ("corte de pelo" no debe buscar "de" en todos los comercios). */
const PALABRAS_VACIAS = new Set([
	'de',
	'del',
	'la',
	'las',
	'el',
	'los',
	'un',
	'una',
	'con',
	'para',
	'por',
	'en',
	'y',
	'o',
	'a',
	'al'
]);

interface Termino {
	texto: string;
	/** Se busca como palabra completa (con su plural): "bar" ≠ "barbería". */
	palabraCompleta: boolean;
	/** Sinónimo del diccionario (no lo escribió el usuario): solo se busca en nombre y rubro. */
	sinonimo: boolean;
}

/**
 * Misma regla que el backend:
 * - lo escrito se busca como comienzo de palabra ("pelu" → "Peluquería", pero "uñas" no está
 *   en "vacunas"); si es una palabra conocida del diccionario, como palabra completa ("comer" no
 *   trae "Comercio", "perro" no trae "Perroud");
 * - los sinónimos, como palabra completa y solo en el nombre y el rubro.
 */
function terminosDeBusqueda(query: string): Termino[] {
	const base = normalizar(query);
	if (!base) return [];
	const terminos = new Map<string, Termino>();
	const agregar = (texto: string, sinonimo: boolean) => {
		if (!texto || terminos.has(texto)) return;
		terminos.set(texto, { texto, sinonimo, palabraCompleta: sinonimo || texto in SINONIMOS });
	};
	agregar(base, false);
	const palabras = base.split(' ').filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));
	for (const palabra of palabras) agregar(palabra, false);
	for (const clave of [...palabras, base]) {
		for (const s of SINONIMOS[clave] ?? []) agregar(normalizar(s), true);
	}
	return [...terminos.values()];
}

/** Expande una consulta en sus términos + sinónimos (normalizados, sin duplicados). */
export function expandirConsulta(query: string): string[] {
	return terminosDeBusqueda(query).map((t) => t.texto);
}

/**
 * `texto` ya viene normalizado (solo letras, números y espacios), así que es seguro dentro de la
 * expresión regular.
 */
function coincideTermino(
	haystack: string,
	{ texto, palabraCompleta }: Pick<Termino, 'texto' | 'palabraCompleta'>
): boolean {
	if (!palabraCompleta) return new RegExp(`(^| )${texto}`).test(haystack);
	return new RegExp(`(^| )${texto}(s|es)?( |$)`).test(haystack);
}

/**
 * Relevancia para ordenar resultados (igual que el backend):
 * 0 = lo escrito como palabra completa en el nombre o el rubro ("bar" → Bares),
 * 1 = lo escrito como comienzo de palabra en el nombre o el rubro ("bar" → Barberías),
 * 2 = un sinónimo en el nombre o el rubro, 3 = el resto (etiquetas, descripción).
 */
export function relevanciaBusqueda(
	empresa: { nombre: string; rubro?: string },
	query: string
): number {
	const terminos = terminosDeBusqueda(query.trim());
	const titulo = normalizar([empresa.nombre, empresa.rubro ?? ''].join(' '));
	const escritos = terminos.filter((t) => !t.sinonimo);
	if (escritos.some((t) => coincideTermino(titulo, { texto: t.texto, palabraCompleta: true })))
		return 0;
	if (escritos.some((t) => coincideTermino(titulo, t))) return 1;
	if (terminos.some((t) => coincideTermino(titulo, t))) return 2;
	return 3;
}

/** ¿Coincide la empresa con la consulta (tolerante + sinónimos)? */
export function coincideBusqueda(
	empresa: { nombre: string; rubro?: string; etiquetas?: string[]; descripcion?: string },
	query: string
): boolean {
	const q = query.trim();
	if (!q) return true;
	const terminos = terminosDeBusqueda(q);
	const principal = normalizar([empresa.nombre, empresa.rubro ?? ''].join(' '));
	// Las etiquetas se normalizan por separado: "Acepta mascotas" y "Color" no se pegan.
	// Cada una también sin signos: "wifi" encuentra "Wi-Fi gratis" (igual que el backend).
	const etiquetas = (empresa.etiquetas ?? []).flatMap((et) => [
		normalizar(et),
		normalizar(et.replace(/[^\p{L}\p{N} ]/gu, ''))
	]);
	const descripcion = normalizar(empresa.descripcion ?? '');
	// En las etiquetas y la descripción solo se busca lo escrito (igual que el backend): un
	// sinónimo como "parrilla" aparece en herrerías que las fabrican, y "mascota" en cualquier
	// comercio que acepte mascotas.
	return terminos.some(
		(t) =>
			coincideTermino(principal, t) ||
			(!t.sinonimo &&
				(etiquetas.some((et) => coincideTermino(et, t)) || coincideTermino(descripcion, t)))
	);
}
