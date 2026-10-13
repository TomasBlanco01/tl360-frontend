import type {
	Categoria,
	Empresa,
	HorariosPorDia,
	MiTurno,
	ReporteAdmin,
	Resena,
	TelefonoEmpresa
} from '$lib/types';
import { categoriasSeed, empresasSeed, horariosSeed, telefonosSeed, usuariosSeed } from './data';
import { slugify } from '$lib/slug';
import { coincideBusqueda } from '$lib/busqueda';
import { aEtiquetaCanoncia, normalizarEtiqueta } from '$lib/etiquetas';

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
let turnos: TurnoInterno[] = [];
const resenas: Record<number, Resena[]> = {};
const reportes: ReporteAdmin[] = [];
const ocupados: Record<string, string[]> = {};

let nextCategoriaId = categorias.length + 1;
let nextEmpresaId = empresas.length + 1;
let nextTurnoId = 1;
let nextUsuarioId = 1000;

// Correos conocidos (seed + registrados en esta sesión) para validar duplicados.
const emailsRegistrados = new Set<string>(
	Object.values(usuariosSeed).map((u) => String(u.email).toLowerCase())
);

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function errorJson(status: number, message: string): Response {
	return json({ message, error: message }, status);
}

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
		return json(turnos.filter((t) => t.empresa_id === e.id));
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
		const lista = (resenas[id] ??= []);
		lista.unshift({
			usuario_nombre: 'Vos (simulado)',
			puntaje,
			comentario: body.comentario ?? null,
			creado_en: new Date().toISOString()
		});
		e.calificacion_cantidad = lista.length;
		e.calificacion_promedio =
			Math.round((lista.reduce((a, r) => a + r.puntaje, 0) / lista.length) * 10) / 10;
		return json({ message: 'Calificación registrada' });
	}
	if (method === 'POST' && (m = pathname.match(/^\/empresas\/([^/]+)\/reportes$/))) {
		const e = buscarEmpresa(m[1]);
		if (!e) return errorJson(404, 'Empresa no encontrada');
		reportes.push({
			id: reportes.length + 1,
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
		return json(limit ? filtradas.slice(offset, offset + limit) : filtradas.slice(offset));
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
					empresa_slug: e?.slug
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
	if (method === 'GET' && pathname === '/auth/existe') {
		const email = String(params.get('email') ?? '').trim().toLowerCase();
		return json({ existe: email !== '' && emailsRegistrados.has(email) });
	}
	if (method === 'POST' && pathname === '/auth/login') {
		const usuario =
			Object.values(usuariosSeed).find((u) => u.email === body.email) ?? usuariosSeed.cliente;
		return json({ message: 'Inicio de sesión exitoso', token: 'mock-token', user: usuario });
	}
	if (method === 'POST' && pathname === '/auth/register') {
		const emailNorm = String(body.email ?? '').trim().toLowerCase();
		if (emailNorm && emailsRegistrados.has(emailNorm)) {
			return errorJson(409, 'Este correo ya existe');
		}
		const rol = body.rol === 'comercio' ? 'comercio' : 'cliente';
		const nuevo = {
			id: nextUsuarioId++,
			nombre: body.nombre,
			email: body.email,
			rol
		};
		if (emailNorm) emailsRegistrados.add(emailNorm);
		return json({ message: 'Registro exitoso', token: 'mock-token', user: nuevo }, 201);
	}
	if (method === 'PUT' && pathname === '/usuarios/yo') {
		if (body.email !== undefined) {
			const emailNorm = String(body.email ?? '').trim().toLowerCase();
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
