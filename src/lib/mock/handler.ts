import type {
	AtencionMostrador,
	Categoria,
	Empresa,
	HorariosPorDia,
	MiTurno,
	Publicidad,
	ReporteAdmin,
	Resena,
	SolicitudPublicidad,
	TelefonoEmpresa,
	TurnoRecibido
} from '$lib/types';
import { categoriasSeed, empresasSeed, horariosSeed, telefonosSeed, usuariosSeed } from './data';
import { slugify } from '$lib/slug';
import { coincideBusqueda } from '$lib/busqueda';
import { aEtiquetaCanoncia, normalizarEtiqueta } from '$lib/etiquetas';
import { distanciaKm } from '$lib/geo';
import { estaAbiertoAhora } from '$lib/turnos';

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

let categorias: Categoria[] = structuredClone(categoriasSeed);
let empresas: Empresa[] = structuredClone(empresasSeed);
// Coordenadas simuladas alrededor del centro de Trenque Lauquen, solo para poder ver el mapa en modo mock.
empresas.forEach((e, i) => {
	e.lat ??= -35.9711 + (((i * 37) % 20) - 10) * 0.0012;
	e.lng ??= -62.7333 + (((i * 53) % 20) - 10) * 0.0015;
});
const horarios: Record<number, HorariosPorDia> = structuredClone(horariosSeed);
const telefonos: Record<number, TelefonoEmpresa[]> = structuredClone(telefonosSeed);

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
const resenasTurno = new Map<number, { empresa_id: number; resena: Resena }>();
// Reportes de ejemplo para que la solapa "Reportes" del admin se vea con contenido.
const reportes: ReporteAdmin[] = [
	{
		id: 1,
		empresa_id: 2,
		empresa_nombre: 'Barbería Dorrego',
		usuario_nombre: 'Martina Gómez',
		motivo: 'El teléfono publicado no responde hace semanas, parece desactualizado.',
		resuelto: false,
		creado_en: new Date(Date.now() - 2 * 86400000).toISOString()
	},
	{
		id: 2,
		empresa_id: 4,
		empresa_nombre: 'Gimnasio Sarmiento',
		usuario_nombre: null,
		motivo: 'El local parece cerrado definitivamente, la persiana está baja.',
		resuelto: false,
		creado_en: new Date(Date.now() - 5 * 86400000).toISOString()
	},
	{
		id: 3,
		empresa_id: 5,
		empresa_nombre: 'Masajes Bienestar',
		usuario_nombre: 'Juan Pérez',
		motivo: 'La dirección no coincide con la que figura en el mapa.',
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
// Publicidades de ejemplo para la solapa "Publicidades" del admin.
let publicidadesMock: Publicidad[] = [
	{
		id: 'seed-1',
		empresa_id: 1,
		titulo: 'Estilo Urbano Peluquería',
		descripcion: '20% off en color este mes',
		imagen_url: 'https://picsum.photos/seed/ad-peluqueria/480/320'
	},
	{
		id: 'seed-2',
		empresa_id: 3,
		titulo: 'PowerFit Trenque',
		descripcion: 'Mes gratis trayendo un amigo',
		imagen_url: 'https://picsum.photos/seed/ad-gym/480/320'
	},
	{
		id: 'seed-3',
		empresa_id: 2,
		titulo: 'Barbería Dorrego',
		descripcion: 'Corte + barba con descuento para nuevos clientes',
		imagen_url: 'https://picsum.photos/seed/ad-barberia/480/320'
	},
	{
		id: 'seed-4',
		empresa_id: 5,
		titulo: 'Masajes Bienestar',
		descripcion: 'Sesión de prueba con 30% de descuento',
		imagen_url: 'https://picsum.photos/seed/ad-masajes/480/320'
	},
	{
		id: 'seed-colecta',
		empresa_id: null,
		titulo: 'Colecta para el hospital',
		descripcion: 'Juntamos insumos para la sala pediátrica: sumate hasta el viernes',
		imagen_url: 'https://picsum.photos/seed/ad-colecta/480/320'
	}
];
let nextPubId = 100;
let nextReporteId = 4;

// RF-06: pedidos de difusión recibidos por el canal público (bandeja del admin).
let solicitudesMock: SolicitudPublicidad[] = [
	{
		id: 1,
		nombre: 'Comisión del Club Ferroviario',
		contacto: 'club@demo.com',
		tipo: 'colecta',
		mensaje: 'Recaudamos para arreglar el techo del vestuario y necesitamos difusión.',
		estado: 'pendiente',
		creado_en: new Date(Date.now() - 86400000).toISOString()
	},
	{
		id: 2,
		nombre: 'María Pérez',
		contacto: '11 5555-1234',
		tipo: 'publicidad',
		mensaje: 'Organizo una feria de emprendedores el sábado en la plaza principal.',
		estado: 'pendiente',
		creado_en: new Date(Date.now() - 3 * 86400000).toISOString()
	},
	{
		id: 3,
		nombre: 'Biblioteca Popular',
		contacto: 'biblioteca@demo.com',
		tipo: 'publicidad',
		mensaje: 'Ciclo de lectura para chicos durante las vacaciones de invierno.',
		estado: 'atendida',
		creado_en: new Date(Date.now() - 8 * 86400000).toISOString()
	}
];
let nextSolicitudId = 4;

// RF-04: atenciones de mostrador de ejemplo del comercio demo (empresa 1).
let atencionesMock: AtencionMostrador[] = [
	{
		id: 1,
		empresa_id: 1,
		fecha: fechaHaceDias(0),
		cantidad: 3,
		importe: 12000,
		nota: 'Cortes de la mañana',
		creado_en: new Date().toISOString()
	},
	{
		id: 2,
		empresa_id: 1,
		fecha: fechaHaceDias(40),
		cantidad: 12,
		importe: null,
		nota: 'Cortes del mes pasado',
		creado_en: new Date(Date.now() - 40 * 86400000).toISOString()
	}
];
let nextAtencionId = 3;

let nextCategoriaId = categorias.length + 1;
let nextEmpresaId = empresas.length + 1;
let nextTurnoId = 1;
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
	if (method === 'GET' && pathname === '/categorias') return json(categorias);
	if (method === 'POST' && pathname === '/categorias') {
		const nueva: Categoria = { id: nextCategoriaId++, nombre: body.nombre };
		categorias = [...categorias, nueva];
		return json(nueva, 201);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/categorias\/(\d+)$/))) {
		const id = Number(m[1]);
		const categoria = categorias.find((c) => c.id === id);
		if (!categoria) return errorJson(404, 'Categoría no encontrada');
		categoria.nombre = body.nombre;
		return json(categoria);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/categorias\/(\d+)$/))) {
		const id = Number(m[1]);
		categorias = categorias.filter((c) => c.id !== id);
		return json({ message: 'Categoría eliminada correctamente' });
	}

	// ---------- Superadmin: usuarios ----------
	if (method === 'GET' && pathname === '/usuarios') {
		return json([...Object.values(usuariosSeed), ...usuariosDinamicos]);
	}
	if (method === 'POST' && pathname === '/usuarios') {
		const emailNorm = String(body.email ?? '')
			.trim()
			.toLowerCase();
		if (emailNorm && emailsRegistrados.has(emailNorm)) {
			return errorJson(409, 'Este correo ya existe');
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

	// ---------- RF-06: canal público de solicitudes ----------
	if (method === 'POST' && pathname === '/solicitudes-publicidad') {
		const nombre = String(body.nombre ?? '').trim();
		const contacto = String(body.contacto ?? '').trim();
		const mensaje = String(body.mensaje ?? '').trim();
		const tipo = body.tipo ?? 'publicidad';
		if (nombre.length < 2 || nombre.length > 100)
			return errorJson(400, 'El nombre debe tener entre 2 y 100 caracteres');
		if (contacto.length < 5) return errorJson(400, 'Dejá un email o un teléfono de contacto');
		const digitos = (contacto.match(/\d/g) ?? []).length;
		if (!contacto.includes('@') && digitos < 6)
			return errorJson(400, 'Dejá un email o un teléfono de contacto');
		if (tipo !== 'publicidad' && tipo !== 'colecta')
			return errorJson(400, "El tipo debe ser 'publicidad' o 'colecta'");
		if (mensaje.length < 10 || mensaje.length > 1000)
			return errorJson(400, 'El mensaje debe tener entre 10 y 1000 caracteres');
		if (
			solicitudesMock.some(
				(s) => s.estado === 'pendiente' && s.contacto.toLowerCase() === contacto.toLowerCase()
			)
		)
			return errorJson(409, 'Ya recibimos una solicitud con este contacto y está pendiente');
		const nueva: SolicitudPublicidad = {
			id: nextSolicitudId++,
			nombre,
			contacto,
			tipo,
			mensaje,
			estado: 'pendiente',
			creado_en: new Date().toISOString()
		};
		solicitudesMock = [nueva, ...solicitudesMock];
		return json(
			{ message: 'Recibimos tu solicitud. La plataforma se va a contactar con vos.' },
			201
		);
	}
	if (method === 'GET' && pathname === '/solicitudes-publicidad') {
		const todas = params.get('todas') === 'true';
		return json(todas ? solicitudesMock : solicitudesMock.filter((s) => s.estado === 'pendiente'));
	}
	if (method === 'PUT' && (m = pathname.match(/^\/solicitudes-publicidad\/(\d+)$/))) {
		const solicitud = solicitudesMock.find((s) => s.id === Number(m![1]));
		if (!solicitud) return errorJson(404, 'Solicitud no encontrada');
		if (!['pendiente', 'atendida', 'descartada'].includes(body.estado))
			return errorJson(400, "El estado debe ser 'pendiente', 'atendida' o 'descartada'");
		solicitud.estado = body.estado;
		return json({ message: 'Solicitud actualizada', estado: solicitud.estado });
	}

	// ---------- Superadmin: publicidades ----------
	if (method === 'GET' && pathname === '/publicidades') {
		const empresaId = params.get('empresa_id');
		const lista = empresaId
			? publicidadesMock.filter((p) => String(p.empresa_id) === empresaId)
			: publicidadesMock;
		return json(lista);
	}
	if (method === 'POST' && pathname === '/publicidades') {
		if (!body.titulo?.trim()) return errorJson(400, 'El título es obligatorio');
		if (!body.descripcion?.trim()) return errorJson(400, 'La descripción es obligatoria');
		if (!body.imagen_url?.trim()) return errorJson(400, 'La imagen es obligatoria');
		let imagen: URL;
		try {
			imagen = new URL(String(body.imagen_url).trim());
		} catch {
			return errorJson(400, 'imagen_url debe ser una URL http(s) válida');
		}
		if (imagen.protocol !== 'http:' && imagen.protocol !== 'https:') {
			return errorJson(400, 'imagen_url debe ser una URL http(s) válida');
		}
		const nueva: Publicidad = {
			id: String(nextPubId++),
			empresa_id:
				body.empresa_id === null || body.empresa_id === undefined || body.empresa_id === ''
					? null
					: Number(body.empresa_id),
			titulo: String(body.titulo).trim(),
			descripcion: String(body.descripcion ?? ''),
			imagen_url: String(body.imagen_url ?? '')
		};
		publicidadesMock = [nueva, ...publicidadesMock];
		return json(nueva, 201);
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
		return json(telefonos[e.id] ?? []);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)\/telefonos$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const lista: TelefonoEmpresa[] = (body.telefonos ?? []).map(
			(t: TelefonoEmpresa, i: number) => ({
				id: i + 1,
				numero: String(t.numero ?? '').replace(/\D/g, ''),
				etiqueta: t.etiqueta,
				modo_contacto: t.modo_contacto
			})
		);
		telefonos[e.id] = lista;
		return json(lista);
	}
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/([^/]+)\/turnos$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const reales = turnos.filter((t) => t.empresa_id === e.id);
		// Solo lectura de ejemplo para el visor del admin; las reservas reales van por /turnos.
		return json(reales.length > 0 ? reales : turnosDemo());
	}

	// ---------- RF-04: atenciones sin reserva (walk-ins) ----------
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/([^/]+)\/atenciones$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const propias = atencionesMock
			.filter((a) => a.empresa_id === e.id)
			.sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1));
		const hoy = fechaHaceDias(0);
		const mes = hoy.slice(0, 7);
		const acumular = (lista: AtencionMostrador[]) => ({
			cantidad: lista.reduce((total, a) => total + a.cantidad, 0),
			importe: Math.round(lista.reduce((total, a) => total + (a.importe ?? 0), 0) * 100) / 100
		});
		const delDia = acumular(propias.filter((a) => a.fecha === hoy));
		const delMes = acumular(propias.filter((a) => a.fecha.startsWith(mes)));
		const total = acumular(propias);
		return json({
			atenciones: propias,
			resumen: {
				hoy_cantidad: delDia.cantidad,
				hoy_importe: delDia.importe,
				mes_cantidad: delMes.cantidad,
				mes_importe: delMes.importe,
				total_cantidad: total.cantidad,
				total_importe: total.importe
			}
		});
	}
	if (method === 'POST' && (m = pathname.match(/^\/empresas\/([^/]+)\/atenciones$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const cantidad = Number(body.cantidad);
		if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 1000)
			return errorJson(400, 'La cantidad debe ser un entero entre 1 y 1000');
		const hoy = fechaHaceDias(0);
		const fecha = body.fecha ? String(body.fecha) : hoy;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return errorJson(400, 'Fecha inválida');
		if (fecha > hoy) return errorJson(400, 'No se pueden registrar atenciones futuras');
		let importe: number | null = null;
		if (body.importe !== null && body.importe !== undefined && body.importe !== '') {
			importe = Number(body.importe);
			if (!Number.isFinite(importe) || importe <= 0)
				return errorJson(400, 'El importe debe ser mayor a cero');
			importe = Math.round(importe * 100) / 100;
		}
		const nota = String(body.nota ?? '').trim() || null;
		if (nota && nota.length > 300)
			return errorJson(400, 'La nota no puede superar los 300 caracteres');
		const nueva: AtencionMostrador = {
			id: nextAtencionId++,
			empresa_id: e.id,
			fecha,
			cantidad,
			importe,
			nota,
			creado_en: new Date().toISOString()
		};
		atencionesMock = [nueva, ...atencionesMock];
		return json(nueva, 201);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/empresas\/([^/]+)\/atenciones\/(\d+)$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		const id = Number(m[2]);
		if (!atencionesMock.some((a) => a.id === id && a.empresa_id === e.id))
			return errorJson(404, 'Atención no encontrada');
		atencionesMock = atencionesMock.filter((a) => !(a.id === id && a.empresa_id === e.id));
		return json({ message: 'Atención eliminada' });
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
			motivo: body.motivo,
			resuelto: false,
			creado_en: new Date().toISOString()
		});
		return json({ message: 'Reporte enviado. Gracias por avisarnos.' });
	}
	// 1.4 — Sello clásico (compat) + flujo con estado.
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)\/verificado$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		e.verificado = !!body.verificado;
		e.verificado_estado = e.verificado ? 'verificado' : 'sin_solicitar';
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
		} else if (accion === 'rechazar') {
			e.verificado = false;
			e.verificado_estado = 'rechazado';
		} else {
			// solicitar / re-solicitar: guarda CUIT + constancia si vienen
			if (body.cuit !== undefined) e.cuit = String(body.cuit).replace(/\D/g, '');
			if (body.constancia_cuit_url !== undefined)
				e.constancia_cuit_url = body.constancia_cuit_url || undefined;
			e.verificado_estado = 'pendiente';
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
		const cat = params.get('categoria_id');
		return json(
			empresas
				.filter((e) => e.lat != null && e.lng != null && (!cat || String(e.categoria_id) === cat))
				.map((e) => ({
					id: e.id,
					slug: e.slug,
					nombre: e.nombre,
					lat: e.lat,
					lng: e.lng,
					categoria_id: e.categoria_id,
					verificado: !!e.verificado
				}))
		);
	}
	if (method === 'GET' && pathname === '/empresas') {
		const q = (params.get('q') ?? '').trim();
		const cat = params.get('categoria_id');
		const admin = params.get('admin_id');
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
				(!cat || String(e.categoria_id) === cat) &&
				(!admin || String(e.admin_id) === admin) &&
				(!verEstado || e.verificado_estado === verEstado) &&
				(etiquetasPedidas.length === 0 ||
					etiquetasPedidas.every((pedida) =>
						(e.etiquetas ?? []).some((t) => normalizarEtiqueta(t) === normalizarEtiqueta(pedida))
					))
		);
		let resultado = filtradas;
		if (geoValido) {
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
		const categoria = categorias.find((c) => c.id === Number(body.categoria_id));
		const id = nextEmpresaId++;
		const nueva: Empresa = {
			id,
			nombre: body.nombre,
			direccion: body.direccion,
			telefono: String(body.telefono ?? '').replace(/\D/g, ''),
			slogan: body.slogan ?? '',
			duracion_turno_min:
				body.duracion_turno_min !== undefined && body.duracion_turno_min !== ''
					? Number(body.duracion_turno_min)
					: undefined,
			categoria_id: Number(body.categoria_id),
			categoria: categoria?.nombre,
			admin_id: body.admin_id ?? null,
			instagram: body.instagram || undefined,
			facebook: body.facebook || undefined,
			fotos: body.fotos ?? [],
			turnos_habilitados: body.turnos_habilitados ?? true,
			modo_contacto: body.modo_contacto ?? 'ambos',
			lat: body.lat ?? null,
			lng: body.lng ?? null,
			descripcion: body.descripcion,
			etiquetas: body.etiquetas ?? [],
			slug: body.slug || slugUnico(body.nombre ?? `comercio-${id}`, id),
			cuit: body.cuit ? String(body.cuit).replace(/\D/g, '') : undefined,
			constancia_cuit_url: body.constancia_cuit_url || undefined,
			verificado_estado: body.verificado_estado ?? 'sin_solicitar',
			verificado: false
		};
		empresas = [...empresas, nueva];
		horarios[nueva.id] = {};
		telefonos[nueva.id] = [];
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
		return json({ ...empresa, telefonos: telefonos[empresa.id] ?? [] });
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/([^/]+)$/))) {
		const empresa = buscarEmpresa(m[1]);
		if (!empresa) return errorJson(404, 'Empresa no encontrada');
		const id = empresa.id;
		const idx = empresas.findIndex((e) => e.id === id);
		const categoria = categorias.find((c) => c.id === Number(body.categoria_id));
		// El slug es estable (SEO): solo cambia si el cliente lo pide explícitamente.
		const slug =
			body.slug || (body.nombre && body.nombre !== empresa.nombre ? empresa.slug : empresa.slug);
		empresas[idx] = {
			...empresas[idx],
			...body,
			telefono:
				body.telefono !== undefined
					? String(body.telefono).replace(/\D/g, '')
					: empresas[idx].telefono,
			duracion_turno_min:
				body.duracion_turno_min !== undefined && body.duracion_turno_min !== ''
					? Number(body.duracion_turno_min)
					: empresas[idx].duracion_turno_min,
			categoria_id:
				body.categoria_id !== undefined ? Number(body.categoria_id) : empresas[idx].categoria_id,
			categoria: categoria?.nombre ?? empresas[idx].categoria,
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

	if (method === 'GET' && pathname === '/auth/existe') {
		const email = String(params.get('email') ?? '')
			.trim()
			.toLowerCase();
		return json({ existe: email !== '' && emailsRegistrados.has(email) });
	}
	if (method === 'POST' && pathname === '/auth/login') {
		const emailNorm = String(body.email ?? '')
			.trim()
			.toLowerCase();
		const usuario =
			registradosMock.get(emailNorm) ??
			Object.values(usuariosSeed).find((u) => u.email === body.email) ??
			usuariosSeed.cliente;
		const verificadoNorm = String(usuario.email ?? '')
			.trim()
			.toLowerCase();
		return json({
			message: 'Inicio de sesión exitoso',
			token: 'mock-token',
			user: { ...usuario, email_verificado: verificadosMock.has(verificadoNorm) }
		});
	}
	if (method === 'POST' && pathname === '/auth/register') {
		const emailNorm = String(body.email ?? '')
			.trim()
			.toLowerCase();
		if (emailNorm && emailsRegistrados.has(emailNorm)) {
			return errorJson(409, 'Este correo ya existe');
		}
		const rol = body.rol === 'comercio' ? 'comercio' : 'cliente';
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
