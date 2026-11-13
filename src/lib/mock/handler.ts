import type {
	Difusion,
	EstadoAprobacion,
	Rubro,
	Empresa,
	HorariosPorDia,
	MiTurno,
	Publicidad,
	ReporteAdmin,
	Resena,
	ResumenComercio,
	TelefonoEmpresa,
	TurnoRecibido
} from '$lib/types';
import { auth } from '$lib/stores/auth.svelte';
import { categoriasSeed, empresasSeed, horariosSeed, usuariosSeed } from './data';
import { slugify } from '$lib/slug';
import { coincideBusqueda, normalizar, relevanciaBusqueda } from '$lib/busqueda';
import { aEtiquetaCanoncia, normalizarEtiqueta } from '$lib/etiquetas';
import { distanciaKm } from '$lib/geo';
import { estaAbiertoAhora, nombreDia, slotsDelDia } from '$lib/turnos';

/**
 * Backend en memoria para PUBLIC_MOCK_MODE=true. No persiste entre recargas de página
 * (a propósito: es solo para recorrer las pantallas con datos de ejemplo, no un backend real).
 *
 * Modela lo que hará PostgreSQL en producción:
 * - `empresas.slug UNIQUE` (URLs amigables, 1.1)
 * - `empresa_etiquetas` N-N (filtro accesibilidad, 1.6)
 * - `turnos` con constraint único (empresa, fecha, hora) + cancelación que libera (1.5)
 * - `verificado_estado` + CUIT con módulo 11 (1.4)
 */

interface TurnoInterno extends MiTurno {
	empresa_id: number;
}

let categorias: Rubro[] = structuredClone(categoriasSeed);
let empresas: Empresa[] = structuredClone(empresasSeed);
// Coordenadas simuladas alrededor del centro de Trenque Lauquen, solo para poder ver el mapa en modo mock.
empresas.forEach((e, i) => {
	e.lat ??= -35.9711 + (((i * 37) % 20) - 10) * 0.0012;
	e.lng ??= -62.7333 + (((i * 53) % 20) - 10) * 0.0015;
});
const horarios: Record<number, HorariosPorDia> = structuredClone(horariosSeed);

/** Igual que el backend: el principal es el marcado o, si no hay, el primero de la lista. */
function normalizarTelefonos(lista: TelefonoEmpresa[]): TelefonoEmpresa[] {
	const principal = Math.max(
		0,
		lista.findIndex((t) => t.principal)
	);
	return lista.map((t, i) => ({
		id: i + 1,
		numero: String(t.numero ?? '').trim(),
		descripcion: t.descripcion || undefined,
		canal: t.canal || undefined,
		es_whatsapp: !!t.es_whatsapp,
		principal: i === principal
	}));
}

/** Mismas reglas que telefono_valido del backend. */
function validarTelefonos(lista: TelefonoEmpresa[]): string | null {
	const vistos = new Set<string>();
	for (const t of lista) {
		const numero = String(t.numero ?? '').trim();
		const digitos = numero.replace(/\D/g, '').length;
		if (!/^\+?[\d\s().-]+$/.test(numero) || digitos < 6 || digitos > 15 || numero.length > 20)
			return `El teléfono '${numero}' no es válido: usá solo números (de 6 a 15 dígitos)`;
		if (vistos.has(numero)) return `El teléfono ${numero} está repetido`;
		vistos.add(numero);
	}
	if (lista.filter((t) => t.principal).length > 1) return 'Solo un teléfono puede ser el principal';
	return null;
}

function fechaHaceDias(dias: number): string {
	const d = new Date();
	d.setDate(d.getDate() - dias);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Turno pasado de ejemplo para poder ver y probar el circuito de calificación (RF-13) en modo mock.
let turnos: TurnoInterno[] = [
	{
		id: 9000,
		fecha: fechaHaceDias(3),
		hora: '10:00:00',
		estado: 'confirmado',
		empresa_nombre: empresas[0].nombre,
		empresa_id: empresas[0].id,
		empresa_slug: empresas[0].slug
	}
];
const resenas: Record<number, Resena[]> = {};
// Reseñas de ejemplo coherentes con el promedio y la cantidad de cada ficha: así la solapa
// "Calificaciones" del dueño muestra lo mismo que la card pública.
{
	const AUTORES = [
		'Laura P.',
		'Marcos D.',
		'Carla S.',
		'Juan I.',
		'Romina T.',
		'Pablo G.',
		'Sol M.'
	];
	const COMENTARIOS = [
		'Excelente atención, muy puntuales.',
		'Muy buena experiencia, vuelvo seguro.',
		'Todo bien, el lugar es cómodo.',
		null,
		'Recomendable, buena relación precio-calidad.'
	];
	for (const e of empresas) {
		const n = e.calificacion_cantidad ?? 0;
		const p = e.calificacion_promedio ?? 0;
		if (!n || !p) continue;
		// Puntajes enteros con el mismo promedio: k reseñas del puntaje superior y el resto del inferior.
		const base = Math.min(4, Math.floor(p));
		const altas = Math.round((p - base) * n);
		resenas[e.id] = Array.from({ length: n }, (_, i) => ({
			usuario_nombre: AUTORES[(e.id + i) % AUTORES.length],
			puntaje: i < altas ? base + 1 : base,
			comentario: COMENTARIOS[(e.id + i) % COMENTARIOS.length],
			creado_en: new Date(Date.now() - (i + 1) * 3 * 86_400_000).toISOString()
		}));
	}
}
const resenasTurno = new Map<number, { empresa_id: number; resena: Resena }>();
// Reportes de ejemplo para que la solapa "Reportes" del admin se vea con contenido.
const reportes: ReporteAdmin[] = [
	{
		id: 1,
		empresa_id: 2,
		empresa_nombre: 'Barbería Dorrego',
		usuario_nombre: 'Martina Gómez',
		descripcion: 'El teléfono publicado no responde hace semanas, parece desactualizado.',
		resuelto: false,
		creado_en: new Date(Date.now() - 2 * 86400000).toISOString()
	},
	{
		id: 2,
		empresa_id: 4,
		empresa_nombre: 'Gimnasio Sarmiento',
		usuario_nombre: null,
		descripcion: 'El local parece cerrado definitivamente, la persiana está baja.',
		resuelto: false,
		creado_en: new Date(Date.now() - 5 * 86400000).toISOString()
	},
	{
		id: 3,
		empresa_id: 5,
		empresa_nombre: 'Masajes Bienestar',
		usuario_nombre: 'Juan Pérez',
		descripcion: 'La dirección no coincide con la que figura en el mapa.',
		resuelto: false,
		creado_en: new Date(Date.now() - 8 * 86400000).toISOString()
	}
];
const ocupados: Record<string, string[]> = {};
// Dueños y clientes extra para que la solapa "Usuarios" del admin se vea con contenido.
// (El login mock solo reconoce los 3 de usuariosSeed; estos son para listar/gestionar.)
let usuariosDinamicos: {
	id: number;
	nombre: string;
	email: string;
	rol: string;
	email_verificado: boolean;
}[] = [
	{
		id: 1001,
		nombre: 'Diego Torres',
		email: 'diego.barberia@demo.com',
		rol: 'admin',
		email_verificado: true
	},
	{
		id: 1002,
		nombre: 'Lucía Fernández',
		email: 'lucia.estetica@demo.com',
		rol: 'admin',
		email_verificado: true
	},
	{
		id: 1003,
		nombre: 'Juan Pérez',
		email: 'juan@demo.com',
		rol: 'cliente',
		email_verificado: true
	},
	{
		id: 1004,
		nombre: 'Carla Ruiz',
		email: 'carla@demo.com',
		rol: 'cliente',
		email_verificado: true
	}
];

// Cada comercio del seed tiene su dueño con nombre (el admin lista "dueño: Nombre", nunca un id).
{
	const NOMBRES = [
		'Lucía',
		'Martín',
		'Valentina',
		'Joaquín',
		'Camila',
		'Federico',
		'Agustina',
		'Nicolás',
		'Florencia',
		'Matías'
	];
	const APELLIDOS = [
		'Fernández',
		'López',
		'Martínez',
		'García',
		'Pereyra',
		'Sosa',
		'Romero',
		'Álvarez',
		'Benítez',
		'Acosta',
		'Medina'
	];
	const conocidos = new Set(
		[...Object.values(usuariosSeed), ...usuariosDinamicos].map((u) => u.id)
	);
	for (const id of [...new Set(empresasSeed.map((e) => e.usuario_id))]
		.filter((n): n is number => n != null)
		.sort((a, b) => a - b)) {
		if (id == null || conocidos.has(id)) continue;
		const nombre = `${NOMBRES[id % NOMBRES.length]} ${APELLIDOS[id % APELLIDOS.length]}`;
		usuariosDinamicos.push({
			id,
			nombre,
			email: `duenio${id}@demo.com`,
			rol: 'admin',
			email_verificado: true
		});
		conocidos.add(id);
	}
}
// Publicidades de ejemplo para la solapa "Publicidades" del admin.
let publicidadesMock: Publicidad[] = [
	{
		id: 'seed-1',
		empresa_id: 1,
		titulo: 'Estilo Urbano Peluquería',
		descripcion: '20% off en color este mes',
		url_imagen: 'https://picsum.photos/seed/ad-peluqueria/480/320',
		estado: 'aprobada'
	},
	{
		id: 'seed-2',
		empresa_id: 3,
		titulo: 'PowerFit Trenque',
		descripcion: 'Mes gratis trayendo un amigo',
		url_imagen: 'https://picsum.photos/seed/ad-gym/480/320',
		estado: 'aprobada'
	},
	{
		id: 'seed-3',
		empresa_id: 2,
		titulo: 'Barbería Dorrego',
		descripcion: 'Corte + barba con descuento para nuevos clientes',
		url_imagen: 'https://picsum.photos/seed/ad-barberia/480/320',
		estado: 'aprobada'
	},
	{
		id: 'seed-4',
		empresa_id: 5,
		titulo: 'Masajes Bienestar',
		descripcion: 'Sesión de prueba con 30% de descuento',
		url_imagen: 'https://picsum.photos/seed/ad-masajes/480/320',
		estado: 'aprobada'
	}
];
publicidadesMock.push({
	id: 'seed-pendiente',
	empresa_id: 1,
	titulo: 'Semana del cliente',
	descripcion: 'Todos los cortes con 15% de descuento de lunes a jueves',
	url_imagen: 'https://picsum.photos/seed/ad-semana-cliente/480/320',
	estado: 'pendiente'
});
for (const p of publicidadesMock) {
	const empresa = empresas.find((e) => e.id === p.empresa_id);
	p.empresa_nombre = empresa?.nombre;
	p.empresa_slug = empresa?.slug;
}
const ESTADOS_APROBACION: EstadoAprobacion[] = ['pendiente', 'aprobada', 'rechazada', 'finalizada'];
let nextPubId = 100;
let nextReporteId = 4;

// RF-06: difusiones de colectas y eventos. La colecta de la plataforma ya está aprobada; los
// pedidos que llegaron por el canal público esperan aprobación en el panel del admin.
let difusionesMock: Difusion[] = [
	{
		id: 1,
		tipo: 'colecta',
		titulo: 'Colecta para el hospital',
		descripcion: 'Juntamos insumos para la sala pediátrica: sumate hasta el viernes',
		url_imagen: 'https://picsum.photos/seed/ad-colecta/480/320',
		solicitante_nombre: 'Admin TL360',
		solicitante_contacto: 'admin@demo.com',
		estado: 'aprobada',
		creado_en: new Date(Date.now() - 2 * 86400000).toISOString()
	},
	{
		id: 2,
		tipo: 'colecta',
		titulo: 'Techo del vestuario del Club Ferroviario',
		descripcion: 'Recaudamos para arreglar el techo del vestuario y necesitamos difusión.',
		solicitante_nombre: 'Comisión del Club Ferroviario',
		solicitante_contacto: 'club@demo.com',
		estado: 'pendiente',
		creado_en: new Date(Date.now() - 86400000).toISOString()
	},
	{
		id: 3,
		tipo: 'evento',
		titulo: 'Feria de emprendedores',
		descripcion: 'Organizo una feria de emprendedores el sábado en la plaza principal.',
		solicitante_nombre: 'María Pérez',
		solicitante_contacto: '11 5555-1234',
		estado: 'pendiente',
		creado_en: new Date(Date.now() - 3 * 86400000).toISOString()
	}
];
let nextDifusionId = 4;

let nextCategoriaId = categorias.length + 1;
let nextEmpresaId = empresas.length + 1;
let nextTurnoId = 1;
// RF-04: turnos que el comercio agenda a mano para alguien sin cuenta.
let turnosAgendados: (TurnoRecibido & { empresa_id: number })[] = [];
let nextUsuarioId = 1010;
let horasRecordatorioMock = 24;

// Correos conocidos (seed + registrados en esta sesión) para validar duplicados.
const emailsRegistrados = new Set<string>([
	...Object.values(usuariosSeed).map((u) => String(u.email).toLowerCase()),
	...usuariosDinamicos.map((u) => u.email.toLowerCase())
]);

// RF-01 en modo mock: los seed nacen verificados; los registrados, sin verificar hasta usar el enlace.
const verificadosMock = new Set<string>([
	...Object.values(usuariosSeed).map((u) => String(u.email).toLowerCase()),
	...usuariosDinamicos.map((u) => u.email.toLowerCase())
]);
const tokensVerificacionMock = new Map<string, string>();
const registradosMock = new Map<
	string,
	{ id: number; nombre: string; email: string; rol: string; email_verificado: boolean }
>();

/** Turnos de ejemplo para el visor del admin ("Ver turnos" en Comercios). No tocan
 *  `/turnos/mis-turnos`: son solo lectura para que la solapa se vea con contenido. */
function turnosDemo(): TurnoRecibido[] {
	return [
		{
			id: 9001,
			fecha: '2026-10-20',
			hora: '10:00',
			estado: 'confirmado',
			cliente_nombre: 'Martina Gómez'
		},
		{
			id: 9002,
			fecha: '2026-10-20',
			hora: '10:30',
			estado: 'confirmado',
			cliente_nombre: 'Juan Pérez'
		},
		{
			id: 9003,
			fecha: '2026-10-21',
			hora: '16:00',
			estado: 'pendiente',
			cliente_nombre: 'Carla Ruiz'
		}
	];
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function errorJson(status: number, message: string): Response {
	return json({ message, error: message }, status);
}

/** Clave pública VAPID de ejemplo: permite probar la suscripción desde el modo mock. */
const PUSH_CLAVE_PUBLICA =
	'BMjQIp55pdbU8pfCBKyXcZjlmER_mXt5LqNrN1hrXbdBS5EnhIbMu3Au-RV53iIpztzNXkGI56BFB1udQ8Bq_H4';

function delay(ms = 150): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 1.1 — Resuelve `/empresas/7` o `/empresas/estilo-urbano-peluqueria` al mismo registro. */
function buscarEmpresa(param: string): Empresa | undefined {
	const p = decodeURIComponent(param);
	if (/^\d+$/.test(p)) return empresas.find((e) => e.id === Number(p));
	return empresas.find((e) => e.slug === p || e.id === Number(p));
}

function slugUnico(nombre: string, id: number, ignorarId?: number): string {
	const base = slugify(nombre) || `comercio-${id}`;
	const usados = new Set(empresas.filter((e) => e.id !== ignorarId).map((e) => e.slug));
	if (!usados.has(base)) return base;
	return `${base}-${id}`;
}

export async function mockFetch(path: string, options: RequestInit = {}): Promise<Response> {
	const method = (options.method ?? 'GET').toUpperCase();
	const [pathname, queryString] = path.split('?');
	const params = new URLSearchParams(queryString ?? '');
	const body = options.body ? JSON.parse(options.body as string) : {};

	await delay();

	let m: RegExpMatchArray | null;

	// ---------- Categorías ----------
	// Igual que el backend: cuántos comercios tiene cada rubro y si alguno toma turnos.
	if (method === 'GET' && pathname === '/rubros')
		return json(
			categorias.map((c) => {
				const delRubro = empresas.filter((e) => e.rubro_id === c.id);
				return {
					...c,
					cantidad: delRubro.length,
					turnos_habilitados: delRubro.some((e) => e.turnos_habilitados !== false)
				};
			})
		);
	if (method === 'POST' && pathname === '/rubros') {
		const nueva: Rubro = { id: nextCategoriaId++, nombre: body.nombre };
		categorias = [...categorias, nueva];
		return json(nueva, 201);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/rubros\/(\d+)$/))) {
		const id = Number(m[1]);
		const categoria = categorias.find((c) => c.id === id);
		if (!categoria) return errorJson(404, 'Rubro no encontrado');
		categoria.nombre = body.nombre;
		return json(categoria);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/rubros\/(\d+)$/))) {
		const id = Number(m[1]);
		categorias = categorias.filter((c) => c.id !== id);
		return json({ message: 'Rubro eliminado correctamente' });
	}

	// ---------- Superadmin: usuarios ----------
	if (method === 'GET' && pathname === '/usuarios') {
		// Igual que el backend: buscador por nombre o correo, filtro por rol y paginado.
		const q = normalizar(params.get('q') ?? '');
		const rol = params.get('rol');
		const ids = params.get('ids')?.split(',').map(Number);
		const lista = [
			...Object.values(usuariosSeed),
			...usuariosDinamicos,
			...registradosMock.values()
		]
			.map((u) => ({
				...u,
				email_verificado: verificadosMock.has(String(u.email).toLowerCase())
			}))
			.filter(
				(u) =>
					(!q || normalizar(u.nombre).includes(q) || u.email.toLowerCase().includes(q)) &&
					(!rol || u.rol === rol) &&
					(!ids || ids.includes(u.id))
			)
			.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id - b.id);
		const offset = Math.max(0, Number(params.get('offset') ?? 0));
		const limit = Math.min(1000, Math.max(1, Number(params.get('limit') ?? 1000)));
		return json(lista.slice(offset, offset + limit));
	}
	// Gestión del superadmin (igual que el backend): confirmar el correo y cambiar el rol.
	if (method === 'PUT' && (m = pathname.match(/^\/usuarios\/(\d+)$/))) {
		if (!auth.isSuperAdmin)
			return errorJson(403, 'No tenés los permisos para realizar esta acción');
		const id = Number(m[1]);
		const u =
			usuariosDinamicos.find((x) => x.id === id) ??
			[...registradosMock.values()].find((x) => x.id === id) ??
			Object.values(usuariosSeed).find((x) => x.id === id);
		if (!u) return errorJson(404, 'Usuario no encontrado');
		const rol = typeof body.rol === 'string' ? body.rol.trim() : '';
		if (rol) {
			if (!['cliente', 'admin', 'superadmin'].includes(rol)) return errorJson(400, 'Rol inválido');
			if (id === auth.user?.id && rol !== 'superadmin')
				return errorJson(400, 'No podés quitarte a vos mismo el rol de superadmin');
			const comercios = empresas.filter((e) => e.usuario_id === id).length;
			if (u.rol === 'admin' && rol !== 'admin' && comercios > 0)
				return errorJson(
					409,
					`Tiene ${comercios} comercio(s) a su nombre: reasignalos a otro dueño antes de cambiarle el rol`
				);
		}
		if (body.email_verificado === false)
			return errorJson(400, 'Solo se puede confirmar un correo, no desverificarlo');
		const email = String(u.email).toLowerCase();
		if (body.email_verificado === true) verificadosMock.add(email);
		if (rol) (u as { rol: string }).rol = rol;
		return json({
			id: u.id,
			nombre: u.nombre,
			email: u.email,
			rol: u.rol,
			email_verificado: verificadosMock.has(email)
		});
	}
	if (method === 'POST' && pathname === '/usuarios') {
		const emailNorm = String(body.email ?? '')
			.trim()
			.toLowerCase();
		if (emailNorm && emailsRegistrados.has(emailNorm)) {
			return errorJson(409, 'Ese correo ya está registrado');
		}
		const nuevo = {
			id: nextUsuarioId++,
			nombre: body.nombre,
			email: body.email,
			rol: body.rol ?? 'cliente',
			// Cuentas creadas por un superadmin: el superadmin avala la cuenta, nace verificada.
			email_verificado: true
		};
		usuariosDinamicos = [...usuariosDinamicos, nuevo];
		if (emailNorm) emailsRegistrados.add(emailNorm);
		if (emailNorm) verificadosMock.add(emailNorm);
		return json({ mensaje: 'Usuario creado' }, 201);
	}

	// ---------- RF-06: difusiones de colectas y eventos (canal público + aprobación) ----------
	if (method === 'POST' && pathname === '/difusiones') {
		const tipo = body.tipo ?? 'colecta';
		const titulo = String(body.titulo ?? '').trim();
		const descripcion = String(body.descripcion ?? '').trim();
		if (tipo !== 'colecta' && tipo !== 'evento')
			return errorJson(400, "El tipo debe ser 'colecta' o 'evento'");
		if (titulo.length < 3 || titulo.length > 100)
			return errorJson(400, 'El título debe tener entre 3 y 100 caracteres');
		if (descripcion.length < 10 || descripcion.length > 1000)
			return errorJson(400, 'La descripción debe tener entre 10 y 1000 caracteres');
		const superadmin = auth.isSuperAdmin;
		const nombre = String(body.solicitante_nombre ?? (superadmin ? auth.user?.nombre : '')).trim();
		const contacto = String(
			body.solicitante_contacto ?? (superadmin ? auth.user?.email : '')
		).trim();
		if (!superadmin) {
			if (nombre.length < 2 || nombre.length > 100)
				return errorJson(400, 'El nombre debe tener entre 2 y 100 caracteres');
			const digitos = (contacto.match(/\d/g) ?? []).length;
			if (contacto.length < 5 || (!contacto.includes('@') && digitos < 6))
				return errorJson(400, 'Dejá un email o un teléfono de contacto');
			if (
				difusionesMock.some(
					(d) =>
						d.estado === 'pendiente' &&
						d.solicitante_contacto?.toLowerCase() === contacto.toLowerCase()
				)
			)
				return errorJson(409, 'Ya recibimos un pedido con este contacto y está pendiente');
		}
		const nueva: Difusion = {
			id: nextDifusionId++,
			tipo,
			titulo,
			descripcion,
			url_imagen: String(body.url_imagen ?? '').trim() || null,
			solicitante_nombre: nombre,
			solicitante_contacto: contacto,
			estado: superadmin ? 'aprobada' : 'pendiente',
			fecha_inicio: body.fecha_inicio ?? null,
			fecha_fin: body.fecha_fin ?? null,
			creado_en: new Date().toISOString()
		};
		difusionesMock = [nueva, ...difusionesMock];
		return json(nueva, 201);
	}
	if (method === 'GET' && pathname === '/difusiones') {
		const estado = params.get('estado');
		if (!estado)
			// Igual que el backend: la portada no expone los datos de quien la pidió.
			return json(
				difusionesMock
					.filter((d) => d.estado === 'aprobada')
					.map(({ solicitante_nombre: _n, solicitante_contacto: _c, ...d }) => d)
			);
		return json(
			estado === 'todas' ? difusionesMock : difusionesMock.filter((d) => d.estado === estado)
		);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/difusiones\/(\d+)\/estado$/))) {
		const difusion = difusionesMock.find((d) => d.id === Number(m![1]));
		if (!difusion) return errorJson(404, 'Difusión no encontrada');
		if (!ESTADOS_APROBACION.includes(body.estado))
			return errorJson(
				400,
				"El estado debe ser 'pendiente', 'aprobada', 'rechazada' o 'finalizada'"
			);
		difusion.estado = body.estado;
		return json(difusion);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/difusiones\/(\d+)$/))) {
		const id = Number(m[1]);
		if (!difusionesMock.some((d) => d.id === id)) return errorJson(404, 'Difusión no encontrada');
		difusionesMock = difusionesMock.filter((d) => d.id !== id);
		return json({ message: 'Difusión eliminada' });
	}

	// ---------- RF-06: publicidades de comercios (con aprobación) ----------
	if (method === 'GET' && pathname === '/publicidades') {
		const empresaId = params.get('empresa_id');
		const estado = params.get('estado');
		let lista = empresaId
			? publicidadesMock.filter((p) => String(p.empresa_id) === empresaId)
			: publicidadesMock;
		// Sin estado: lo público (aprobadas). Con estado: la bandeja de gestión.
		if (!estado) lista = lista.filter((p) => p.estado === 'aprobada');
		else if (estado !== 'todas') lista = lista.filter((p) => p.estado === estado);
		// Gestión: por nombre del comercio o por título.
		const q = normalizar(params.get('q') ?? '');
		if (estado && q)
			lista = lista.filter(
				(p) => normalizar(p.empresa_nombre ?? '').includes(q) || normalizar(p.titulo).includes(q)
			);
		return json(lista);
	}
	if (method === 'POST' && pathname === '/publicidades') {
		if (!body.empresa_id) return errorJson(400, 'Indicá el comercio de la publicidad');
		if (!body.titulo?.trim()) return errorJson(400, 'El título es obligatorio');
		if (!body.descripcion?.trim()) return errorJson(400, 'La descripción es obligatoria');
		if (!body.url_imagen?.trim()) return errorJson(400, 'La imagen es obligatoria');
		let imagen: URL;
		try {
			imagen = new URL(String(body.url_imagen).trim());
		} catch {
			return errorJson(400, 'url_imagen debe ser una URL http(s) válida');
		}
		if (imagen.protocol !== 'http:' && imagen.protocol !== 'https:') {
			return errorJson(400, 'url_imagen debe ser una URL http(s) válida');
		}
		const empresa = empresas.find((e) => e.id === Number(body.empresa_id));
		const nueva: Publicidad = {
			id: String(nextPubId++),
			empresa_id: Number(body.empresa_id),
			empresa_nombre: empresa?.nombre,
			empresa_slug: empresa?.slug,
			titulo: String(body.titulo).trim(),
			descripcion: String(body.descripcion ?? ''),
			url_imagen: String(body.url_imagen ?? ''),
			// Igual que el backend: la del dueño queda pendiente; la del superadmin, aprobada.
			estado: auth.isSuperAdmin ? 'aprobada' : 'pendiente'
		};
		publicidadesMock = [nueva, ...publicidadesMock];
		return json(nueva, 201);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/publicidades\/(.+)\/estado$/))) {
		const publicidad = publicidadesMock.find((p) => p.id === m![1]);
		if (!publicidad) return errorJson(404, 'Publicidad no encontrada');
		if (!ESTADOS_APROBACION.includes(body.estado))
			return errorJson(
				400,
				"El estado debe ser 'pendiente', 'aprobada', 'rechazada' o 'finalizada'"
			);
		publicidad.estado = body.estado;
		return json(publicidad);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/publicidades\/(.+)$/))) {
		publicidadesMock = publicidadesMock.filter((p) => p.id !== m![1]);
		return json({ message: 'Publicidad eliminada' });
	}

	// ---------- Empresas: sub-recursos (antes que /empresas/:id) ----------
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/horarios\/([^/]+)$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		return json(horarios[e.id] ?? {});
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)\/horarios$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		horarios[e.id] = body.horarios ?? {};
		return json(horarios[e.id]);
	}
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/([^/]+)\/telefonos$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		return json(e.telefonos ?? []);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)\/telefonos$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const error = validarTelefonos(body.telefonos ?? []);
		if (error) return errorJson(400, error);
		e.telefonos = normalizarTelefonos(body.telefonos ?? []);
		return json(e.telefonos);
	}
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/([^/]+)\/turnos$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		// Las reservas del modo mock son del cliente demo: se informan con su nombre y correo
		// (antes salían sin cliente_nombre y el aviso de cancelar mostraba "undefined").
		const reales: TurnoRecibido[] = turnos
			.filter((t) => t.empresa_id === e.id)
			.map((t) => ({
				id: t.id,
				fecha: t.fecha,
				hora: t.hora,
				estado: t.estado,
				cliente_nombre: usuariosSeed.cliente.nombre,
				cliente_email: usuariosSeed.cliente.email,
				sin_cuenta: false,
				origen: 'online' as const
			}));
		const agendados = turnosAgendados
			.filter((t) => t.empresa_id === e.id && t.estado !== 'cancelado')
			.map(({ empresa_id: _omit, ...t }) => t);
		const lista = [...reales, ...agendados].sort((a, b) =>
			`${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`)
		);
		// Sin turnos propios, se muestran unos de ejemplo para que la solapa no quede vacía.
		return json(lista.length > 0 ? lista : turnosDemo());
	}
	if (method === 'POST' && (m = pathname.match(/^\/empresas\/([^/]+)\/turnos$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const nombre = String(body.cliente_nombre ?? '').trim();
		const { fecha, hora } = body;
		if (!fecha || !hora) return errorJson(400, 'Indicá la fecha y la hora del turno');
		if (!nombre) return errorJson(400, 'El nombre es obligatorio (hasta 100 caracteres)');
		if (String(body.nota ?? '').trim().length > 300)
			return errorJson(400, 'La nota no puede superar los 300 caracteres');
		// Misma grilla que la reserva online (el backend la valida igual): día con horario,
		// hora dentro de una franja y en un múltiplo de la duración del turno.
		const franjas = (horarios[e.id] ?? {})[nombreDia(fecha)] ?? [];
		if (franjas.length === 0) return errorJson(400, 'El comercio no atiende ese día');
		if (!slotsDelDia(fecha, horarios[e.id] ?? {}, e.duracion_turno_min || 30).includes(hora))
			return errorJson(400, 'Ese horario no está disponible: elegí uno de la grilla del comercio');
		const key = `${e.id}_${fecha}`;
		if ((ocupados[key] ?? []).includes(hora)) return errorJson(409, 'Turno ya ocupado');
		ocupados[key] = [...(ocupados[key] ?? []), hora];
		const id = nextTurnoId++;
		turnosAgendados = [
			...turnosAgendados,
			{
				id,
				empresa_id: e.id,
				fecha,
				hora,
				estado: 'confirmado',
				cliente_nombre: nombre,
				cliente_email: String(body.cliente_email ?? '').trim() || null,
				sin_cuenta: true,
				origen: 'mostrador',
				nota: String(body.nota ?? '').trim() || null
			}
		];
		return json({ id, message: 'Turno agendado correctamente' }, 201);
	}

	// ---------- Resumen de actividad del comercio (se calcula a pedido) ----------
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/([^/]+)\/resumen$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const hasta = params.get('hasta') ?? fechaHaceDias(0);
		const desde =
			params.get('desde') ??
			new Date(new Date(`${hasta}T12:00:00`).getTime() - 29 * 86400000).toISOString().slice(0, 10);
		if (hasta < desde)
			return errorJson(400, 'La fecha de fin no puede ser anterior a la de inicio');
		const delPeriodo = [
			...turnos
				.filter((t) => t.empresa_id === e.id)
				.map((t) => ({ fecha: t.fecha, estado: t.estado, origen: 'online' as const })),
			...turnosAgendados
				.filter((t) => t.empresa_id === e.id)
				.map((t) => ({ fecha: t.fecha, estado: t.estado, origen: 'mostrador' as const }))
		].filter((t) => t.fecha >= desde && t.fecha <= hasta);
		const activos = delPeriodo.filter((t) => t.estado !== 'cancelado');
		const porDia = new Map<string, { fecha: string; turnos: number; cancelados: number }>();
		for (const t of delPeriodo) {
			const dia = porDia.get(t.fecha) ?? { fecha: t.fecha, turnos: 0, cancelados: 0 };
			if (t.estado === 'cancelado') dia.cancelados++;
			else dia.turnos++;
			porDia.set(t.fecha, dia);
		}
		const resenasDe = resenas[e.id] ?? [];
		const resumen: ResumenComercio = {
			empresa_id: e.id,
			empresa_nombre: e.nombre,
			desde,
			hasta,
			turnos: {
				turnos: activos.length,
				online: activos.filter((t) => t.origen === 'online').length,
				mostrador: activos.filter((t) => t.origen === 'mostrador').length,
				confirmados: delPeriodo.filter((t) => t.estado === 'confirmado').length,
				completados: delPeriodo.filter((t) => t.estado === 'completado').length,
				cancelados: delPeriodo.filter((t) => t.estado === 'cancelado').length,
				no_asistio: delPeriodo.filter((t) => t.estado === 'no_asistio').length
			},
			calificaciones: resenasDe.length,
			calificacion_promedio: resenasDe.length
				? Math.round((resenasDe.reduce((s, r) => s + r.puntaje, 0) / resenasDe.length) * 10) / 10
				: null,
			favoritos_nuevos: 0,
			por_dia: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
		};
		return json(resumen);
	}

	// ---------- Reseñas, reportes y sello de verificado ----------
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/([^/]+)\/calificaciones$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		return json(resenas[e.id] ?? []);
	}
	if (method === 'POST' && (m = pathname.match(/^\/empresas\/([^/]+)\/calificaciones$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const id = e.id;
		const puntaje = Number(body.puntaje);
		if (!(puntaje >= 1 && puntaje <= 5)) return errorJson(400, 'El puntaje debe estar entre 1 y 5');
		// RF-13: una reseña por turno, del propio cliente y después de su horario.
		const turnoId = Number(body.turno_id);
		if (!turnoId) return errorJson(400, 'Elegí el turno que querés calificar');
		const turno = turnos.find((t) => t.id === turnoId);
		if (!turno) return errorJson(404, 'Turno no encontrado');
		if (turno.empresa_id !== id) return errorJson(400, 'Ese turno pertenece a otro comercio');
		if (turno.estado !== 'confirmado' && turno.estado !== 'completado')
			return errorJson(400, 'No podés calificar un turno cancelado o no asistido');
		if (new Date(`${turno.fecha}T${turno.hora}`).getTime() >= Date.now())
			return errorJson(400, 'Solo podés calificar después del horario del turno');
		const previa = resenasTurno.get(turnoId);
		if (previa) {
			previa.resena.puntaje = puntaje;
			previa.resena.comentario = body.comentario ?? null;
		} else {
			const resena: Resena = {
				usuario_nombre: 'Vos (simulado)',
				puntaje,
				comentario: body.comentario ?? null,
				creado_en: new Date().toISOString()
			};
			(resenas[id] ??= []).unshift(resena);
			resenasTurno.set(turnoId, { empresa_id: id, resena });
		}
		const lista = resenas[id] ?? [];
		e.calificacion_cantidad = lista.length;
		e.calificacion_promedio =
			Math.round((lista.reduce((a, r) => a + r.puntaje, 0) / lista.length) * 10) / 10;
		return json({ message: 'Calificación registrada' });
	}
	if (method === 'POST' && (m = pathname.match(/^\/empresas\/([^/]+)\/reportes$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		reportes.push({
			id: nextReporteId++,
			empresa_id: e.id,
			empresa_nombre: e.nombre,
			usuario_nombre: 'Vos (simulado)',
			descripcion: body.descripcion,
			resuelto: false,
			creado_en: new Date().toISOString()
		});
		return json({ message: 'Reporte enviado. Gracias por avisarnos.' });
	}
	// 1.4 — Sello clásico (compat) + flujo con estado.
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)\/verificado$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		// Igual que el backend: el sello solo se otorga aprobando la verificación.
		if (body.verificado) {
			return errorJson(
				409,
				`El sello se otorga con 'aprobar' desde la verificación (estado actual: ${e.verificado_estado})`
			);
		}
		e.verificado = false;
		if (e.verificado_estado === 'verificado') e.verificado_estado = 'sin_solicitar';
		return json({ verificado: e.verificado, verificado_estado: e.verificado_estado });
	}
	// 1.4 — Aprobar / rechazar verificación con CUIT.
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)\/verificacion$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const accion = body.accion as 'aprobar' | 'rechazar' | 'solicitar';
		if (accion === 'aprobar') {
			e.verificado = true;
			e.verificado_estado = 'verificado';
			delete e.motivo_rechazo;
		} else if (accion === 'rechazar') {
			// RF-15: igual que el backend, rechazar exige un motivo de 5 a 500 caracteres.
			const motivo = String(body.motivo ?? '').trim();
			if (motivo.length < 5 || motivo.length > 500) {
				return errorJson(400, 'Indicá el motivo del rechazo (entre 5 y 500 caracteres)');
			}
			e.verificado = false;
			e.verificado_estado = 'rechazado';
			e.motivo_rechazo = motivo;
		} else {
			// solicitar / re-solicitar: guarda CUIT + constancia si vienen y vuelve a revisión.
			if (body.cuit !== undefined) e.cuit = String(body.cuit).replace(/\D/g, '');
			if (body.url_cuit !== undefined) e.url_cuit = body.url_cuit || undefined;
			e.verificado = false;
			e.verificado_estado = 'pendiente';
			delete e.motivo_rechazo;
		}
		return json({ verificado: e.verificado, verificado_estado: e.verificado_estado });
	}
	if (method === 'GET' && pathname === '/reportes') {
		return json(reportes.filter((r) => params.get('resueltos') === 'true' || !r.resuelto));
	}
	if (method === 'PUT' && (m = pathname.match(/^\/reportes\/(\d+)\/resolver$/))) {
		const r = reportes.find((x) => x.id === Number(m![1]));
		if (!r) return errorJson(404, 'Reporte no encontrado');
		r.resuelto = true;
		return json({ message: 'Reporte resuelto' });
	}

	// ---------- Empresas ----------
	if (method === 'GET' && pathname === '/empresas/mapa') {
		// Los mismos filtros que el listado (búsqueda, rubro y etiquetas).
		const cat = params.get('rubro_id');
		const q = (params.get('q') ?? '').trim();
		const pedidas = (params.get('etiquetas') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map(aEtiquetaCanoncia);
		return json(
			empresas
				.filter(
					(e) =>
						e.lat != null &&
						e.lng != null &&
						(!cat || String(e.rubro_id) === cat) &&
						(!q || coincideBusqueda(e, q)) &&
						pedidas.every((pedida) =>
							(e.etiquetas ?? []).some((t) => normalizarEtiqueta(t) === normalizarEtiqueta(pedida))
						)
				)
				.map((e) => ({
					id: e.id,
					slug: e.slug,
					nombre: e.nombre,
					lat: e.lat,
					lng: e.lng,
					rubro_id: e.rubro_id,
					verificado: !!e.verificado
				}))
		);
	}
	if (method === 'GET' && pathname === '/empresas') {
		const q = (params.get('q') ?? '').trim();
		const cat = params.get('rubro_id');
		const admin = params.get('usuario_id');
		const verEstado = params.get('verificado_estado');
		const etiquetasParam = params.get('etiquetas');
		const limit = params.get('limit') ? Number(params.get('limit')) : undefined;
		const offset = Number(params.get('offset') ?? 0);
		const latParam = params.get('lat');
		const lngParam = params.get('lng');
		const hayCoordenadas = latParam !== null || lngParam !== null;
		const lat = latParam !== null ? Number(latParam) : NaN;
		const lng = lngParam !== null ? Number(lngParam) : NaN;
		const geoValido =
			Number.isFinite(lat) &&
			Number.isFinite(lng) &&
			lat >= -90 &&
			lat <= 90 &&
			lng >= -180 &&
			lng <= 180;
		if (hayCoordenadas && (latParam === null || lngParam === null || !geoValido)) {
			return errorJson(400, 'Enviá las dos coordenadas (lat y lng) juntas y en rango');
		}
		const etiquetasPedidas = etiquetasParam
			? etiquetasParam
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
					.map(aEtiquetaCanoncia)
			: [];
		const filtradas = empresas.filter(
			(e) =>
				(!q || coincideBusqueda(e, q)) &&
				(!cat || String(e.rubro_id) === cat) &&
				(!admin || String(e.usuario_id) === admin) &&
				(!verEstado || e.verificado_estado === verEstado) &&
				(etiquetasPedidas.length === 0 ||
					etiquetasPedidas.every((pedida) =>
						(e.etiquetas ?? []).some((t) => normalizarEtiqueta(t) === normalizarEtiqueta(pedida))
					))
		);
		// Con texto buscado, primero lo que coincide en nombre/rubro (como el backend).
		if (q) {
			const rel = new Map(filtradas.map((e) => [e.id, relevanciaBusqueda(e, q)]));
			filtradas.sort((a, b) => rel.get(a.id)! - rel.get(b.id)!);
		}
		let resultado = filtradas;
		// ?ids=1,2,3: las fichas que el mapa tiene a la vista, en ese orden.
		const idsParam = params.get('ids');
		if (idsParam) {
			const ids = idsParam.split(',').map(Number);
			if (ids.some((n) => !Number.isInteger(n)))
				return errorJson(400, 'ids debe ser una lista de números separados por coma');
			resultado = ids
				.map((id) => filtradas.find((e) => e.id === id))
				.filter((e): e is Empresa => !!e);
		}
		if (geoValido && !idsParam) {
			const ordenadas = filtradas.map((e) => ({
				e,
				km: e.lat != null && e.lng != null ? distanciaKm([lat, lng], [e.lat, e.lng]) : null,
				abierto: estaAbiertoAhora(horarios[e.id] ?? {})
			}));
			ordenadas.sort(
				(a, b) =>
					Number(a.km === null) - Number(b.km === null) ||
					Number(b.abierto) - Number(a.abierto) ||
					(a.km ?? 0) - (b.km ?? 0) ||
					Number(!!b.e.verificado) - Number(!!a.e.verificado) ||
					Number(b.e.turnos_habilitados !== false) - Number(a.e.turnos_habilitados !== false) ||
					a.e.id - b.e.id
			);
			resultado = ordenadas.map(({ e, km, abierto }) =>
				km == null ? e : { ...e, distancia_km: km, abierto_ahora: abierto }
			);
		}
		return json(limit ? resultado.slice(offset, offset + limit) : resultado.slice(offset));
	}
	if (method === 'POST' && pathname === '/empresas') {
		const categoria = categorias.find((c) => c.id === Number(body.rubro_id));
		const id = nextEmpresaId++;
		const nueva: Empresa = {
			id,
			nombre: body.nombre,
			direccion: body.direccion,
			telefonos: normalizarTelefonos(body.telefonos ?? []),
			slogan: body.slogan ?? '',
			duracion_turno_min:
				body.duracion_turno_min !== undefined && body.duracion_turno_min !== ''
					? Number(body.duracion_turno_min)
					: undefined,
			rubro_id: Number(body.rubro_id),
			rubro: categoria?.nombre,
			usuario_id: body.usuario_id ?? null,
			redes_sociales: body.redes_sociales ?? [],
			fotos: body.fotos ?? [],
			turnos_habilitados: body.turnos_habilitados ?? true,
			modo_contacto: body.modo_contacto ?? 'ambos',
			lat: body.lat ?? null,
			lng: body.lng ?? null,
			descripcion: body.descripcion,
			etiquetas: body.etiquetas ?? [],
			slug: body.slug || slugUnico(body.nombre ?? `comercio-${id}`, id),
			cuit: body.cuit ? String(body.cuit).replace(/\D/g, '') : undefined,
			url_cuit: body.url_cuit || undefined,
			verificado_estado: body.verificado_estado ?? 'sin_solicitar',
			verificado: false
		};
		empresas = [...empresas, nueva];
		horarios[nueva.id] = {};
		return json(nueva, 201);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/empresas\/([^/]+)$/))) {
		const empresa = buscarEmpresa(m[1]);
		if (!empresa) return errorJson(404, 'Empresa no encontrada');
		empresas = empresas.filter((e) => e.id !== empresa.id);
		return json({ message: 'Empresa eliminada correctamente' });
	}
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/([^/]+)$/))) {
		const empresa = buscarEmpresa(m[1]);
		if (!empresa) return errorJson(404, 'Empresa no encontrada');
		return json(empresa);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)$/))) {
		const empresa = buscarEmpresa(m[1]);
		if (!empresa) return errorJson(404, 'Empresa no encontrada');
		const id = empresa.id;
		const idx = empresas.findIndex((e) => e.id === id);
		const categoria = categorias.find((c) => c.id === Number(body.rubro_id));
		// El slug es estable (SEO): solo cambia si el cliente lo pide explícitamente.
		const slug =
			body.slug || (body.nombre && body.nombre !== empresa.nombre ? empresa.slug : empresa.slug);
		empresas[idx] = {
			...empresas[idx],
			...body,
			telefonos:
				body.telefonos !== undefined
					? normalizarTelefonos(body.telefonos)
					: empresas[idx].telefonos,
			redes_sociales: body.redes_sociales ?? empresas[idx].redes_sociales,
			duracion_turno_min:
				body.duracion_turno_min !== undefined && body.duracion_turno_min !== ''
					? Number(body.duracion_turno_min)
					: empresas[idx].duracion_turno_min,
			rubro_id: body.rubro_id !== undefined ? Number(body.rubro_id) : empresas[idx].rubro_id,
			rubro: categoria?.nombre ?? empresas[idx].rubro,
			fotos: body.fotos ?? empresas[idx].fotos,
			turnos_habilitados: body.turnos_habilitados ?? empresas[idx].turnos_habilitados ?? true,
			slug,
			cuit:
				body.cuit !== undefined
					? String(body.cuit).replace(/\D/g, '') || undefined
					: empresas[idx].cuit,
			verificado_estado: body.verificado_estado ?? empresas[idx].verificado_estado
		};
		return json(empresas[idx]);
	}

	// ---------- Turnos ----------
	if (method === 'GET' && pathname === '/turnos/mis-turnos') {
		return json(
			turnos.map((t) => {
				const e = empresas.find((x) => x.id === t.empresa_id);
				return {
					id: t.id,
					fecha: t.fecha,
					hora: t.hora,
					estado: t.estado,
					empresa_nombre: t.empresa_nombre,
					empresa_id: t.empresa_id,
					empresa_slug: e?.slug,
					empresa_direccion: e?.direccion ?? '',
					duracion_min: e?.duracion_turno_min ?? null,
					calificado: resenasTurno.has(t.id)
				};
			})
		);
	}
	if (method === 'GET' && pathname === '/turnos/ocupados') {
		const key = `${params.get('empresa_id')}_${params.get('fecha')}`;
		return json((ocupados[key] ?? []).map((hora) => ({ hora })));
	}
	if (method === 'POST' && pathname === '/turnos/reservar') {
		// Igual que el backend: la reserva online es de clientes.
		if (auth.user && auth.user.rol !== 'cliente')
			return errorJson(
				403,
				'No tenés los permisos para realizar esta acción: las reservas online se hacen con una cuenta de cliente; el comercio agenda sus turnos desde Mi Negocio'
			);
		const { empresa_id, fecha, hora } = body;
		if (!empresa_id || !fecha || !hora) return errorJson(400, 'Faltan datos para reservar.');
		const key = `${empresa_id}_${fecha}`;
		// 1.5 Concurrencia: constraint único (empresa, fecha, hora) → 409 si ya está tomado.
		if ((ocupados[key] ?? []).includes(hora)) {
			return errorJson(409, 'Ese horario ya fue reservado. Elegí otro.');
		}
		ocupados[key] = [...(ocupados[key] ?? []), hora];
		const empresa = empresas.find((e) => e.id === Number(empresa_id));
		const turno: TurnoInterno = {
			id: nextTurnoId++,
			fecha,
			hora,
			estado: 'confirmado',
			empresa_nombre: empresa?.nombre ?? '',
			empresa_id: Number(empresa_id),
			empresa_slug: empresa?.slug
		};
		turnos = [...turnos, turno];
		const { empresa_id: _omit, ...publico } = turno;
		return json({ ...publico, empresa_id: turno.empresa_id }, 201);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/turnos\/cancelar\/(\d+)$/))) {
		const id = Number(m[1]);
		const agendado = turnosAgendados.find((t) => t.id === id && t.estado !== 'cancelado');
		if (agendado) {
			const key = `${agendado.empresa_id}_${agendado.fecha}`;
			ocupados[key] = (ocupados[key] ?? []).filter((h) => h !== agendado.hora);
			agendado.estado = 'cancelado';
			return json({ message: 'Turno cancelado correctamente' });
		}
		const turno = turnos.find((t) => t.id === id);
		if (!turno) return errorJson(404, 'Turno no encontrado');
		// 1.5 Liberación reactiva: quitar el slot del diccionario de ocupados.
		const key = `${turno.empresa_id}_${turno.fecha}`;
		ocupados[key] = (ocupados[key] ?? []).filter((h) => h !== turno.hora);
		if (ocupados[key].length === 0) delete ocupados[key];
		turnos = turnos.filter((t) => t.id !== id);
		return json({ message: 'Turno cancelado correctamente' });
	}

	// ---------- Auth ----------
	if (method === 'GET' && pathname === '/push/clave-publica') {
		return json({ clave_publica: PUSH_CLAVE_PUBLICA });
	}
	if (method === 'POST' && pathname === '/push/suscripciones') {
		if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
			return errorJson(400, 'Suscripción push inválida');
		}
		return json({ id: 1 }, 201);
	}
	if (method === 'DELETE' && pathname === '/push/suscripciones') {
		return new Response(null, { status: 204 });
	}

	if (method === 'POST' && pathname === '/auth/login') {
		const emailNorm = String(body.email ?? '')
			.trim()
			.toLowerCase();
		// Entran las cuentas de ejemplo, las registradas y las que creó el superadmin en Usuarios.
		// Un correo desconocido no entra (antes entraba como la clienta de ejemplo y confundía).
		const usuario =
			registradosMock.get(emailNorm) ??
			Object.values(usuariosSeed).find((u) => u.email.toLowerCase() === emailNorm) ??
			usuariosDinamicos.find((u) => u.email.toLowerCase() === emailNorm);
		if (!usuario) return errorJson(401, 'Correo o contraseña incorrectos');
		const verificadoNorm = String(usuario.email ?? '')
			.trim()
			.toLowerCase();
		return json({
			message: 'Inicio de sesión exitoso',
			token: 'mock-token',
			user: {
				...usuario,
				email_verificado: usuario.email_verificado === true || verificadosMock.has(verificadoNorm)
			}
		});
	}
	if (method === 'POST' && pathname === '/auth/register') {
		const emailNorm = String(body.email ?? '')
			.trim()
			.toLowerCase();
		if (emailNorm && emailsRegistrados.has(emailNorm)) {
			return errorJson(409, 'Ese correo ya está registrado');
		}
		// Igual que el backend: "comercio" crea una cuenta de dueño (rol admin) y el resto, cliente.
		const rol = body.rol === 'comercio' || body.rol === 'admin' ? 'admin' : 'cliente';
		const nuevo = {
			id: nextUsuarioId++,
			nombre: body.nombre,
			email: body.email,
			rol,
			email_verificado: false
		};
		if (emailNorm) emailsRegistrados.add(emailNorm);
		if (emailNorm) registradosMock.set(emailNorm, nuevo);
		// RF-01 en modo mock: la cuenta nace sin verificar y se devuelve un token de ejemplo
		// para poder recorrer el flujo sin un correo real.
		const tokenDemo = `demo-verificar-${nuevo.id}`;
		tokensVerificacionMock.set(tokenDemo, emailNorm);
		return json(
			{
				message: 'Registro exitoso. Te enviamos un correo para verificar tu cuenta.',
				token: 'mock-token',
				user: nuevo,
				token_verificacion: tokenDemo
			},
			201
		);
	}
	if (method === 'POST' && pathname === '/auth/verificar-email') {
		const emailNorm = tokensVerificacionMock.get(String(body.token ?? ''));
		if (!emailNorm) return errorJson(400, 'El enlace de verificación es inválido o venció');
		tokensVerificacionMock.delete(String(body.token));
		verificadosMock.add(emailNorm);
		return json({ message: 'Cuenta verificada correctamente. Ya podés reservar turnos.' });
	}
	if (method === 'POST' && pathname === '/auth/reenviar-verificacion') {
		const emailNorm = String(body.email ?? '')
			.trim()
			.toLowerCase();
		let tokenDemo: string | undefined;
		if (emailNorm && emailsRegistrados.has(emailNorm) && !verificadosMock.has(emailNorm)) {
			tokenDemo = `demo-verificar-${emailNorm}`;
			tokensVerificacionMock.set(tokenDemo, emailNorm);
		}
		return json({
			message:
				'Si el correo está registrado y pendiente de verificación, te enviamos un nuevo enlace.',
			...(tokenDemo ? { token_verificacion: tokenDemo } : {})
		});
	}
	if (method === 'GET' && pathname === '/usuarios/yo/recordatorio') {
		return json({ horas: horasRecordatorioMock });
	}
	if (method === 'PUT' && pathname === '/usuarios/yo/recordatorio') {
		const horas = Number(body.horas);
		if (!Number.isInteger(horas) || horas < 1 || horas > 168) {
			return errorJson(400, 'La anticipación debe ser entre 1 y 168 horas');
		}
		horasRecordatorioMock = horas;
		return json({ horas });
	}
	if (method === 'PUT' && pathname === '/usuarios/yo') {
		if (body.email !== undefined) {
			const emailNorm = String(body.email ?? '')
				.trim()
				.toLowerCase();
			// No se bloquea el propio correo; solo se registra para futuros duplicados.
			if (emailNorm) emailsRegistrados.add(emailNorm);
		}
		return json({
			id: body.id ?? 1,
			nombre: body.nombre ?? 'Usuario',
			email: body.email ?? 'usuario@test.com',
			rol: body.rol ?? 'cliente',
			...body
		});
	}
	if (method === 'POST' && pathname === '/auth/forgot-password') {
		return json({
			message: 'Si el correo existe, te enviamos instrucciones (simulado en modo mock).'
		});
	}
	if (method === 'POST' && pathname === '/auth/reset-password') {
		return json({ message: 'Contraseña actualizada (simulado en modo mock).' });
	}

	return errorJson(404, `Mock: no hay datos de ejemplo para ${method} ${pathname}`);
}
