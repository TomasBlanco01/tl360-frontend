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

/**
 * Backend en memoria para PUBLIC_MOCK_MODE=true. No persiste entre recargas de página
 * (a propósito: es solo para recorrer las pantallas con datos de ejemplo, no un backend real).
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
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/horarios\/(\d+)$/))) {
		return json(horarios[Number(m[1])] ?? {});
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/(\d+)\/horarios$/))) {
		const id = Number(m[1]);
		horarios[id] = body.horarios ?? {};
		return json(horarios[id]);
	}
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/(\d+)\/telefonos$/))) {
		return json(telefonos[Number(m[1])] ?? []);
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/(\d+)\/telefonos$/))) {
		const id = Number(m[1]);
		const lista: TelefonoEmpresa[] = (body.telefonos ?? []).map(
			(t: TelefonoEmpresa, i: number) => ({ id: i + 1, numero: t.numero, etiqueta: t.etiqueta })
		);
		telefonos[id] = lista;
		return json(lista);
	}
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/(\d+)\/turnos$/))) {
		const id = Number(m[1]);
		return json(turnos.filter((t) => t.empresa_id === id));
	}

	// ---------- Reseñas, reportes y sello de verificado ----------
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/(\d+)\/calificaciones$/))) {
		return json(resenas[Number(m[1])] ?? []);
	}
	if (method === 'POST' && (m = pathname.match(/^\/empresas\/(\d+)\/calificaciones$/))) {
		const id = Number(m[1]);
		const puntaje = Number(body.puntaje);
		if (!(puntaje >= 1 && puntaje <= 5)) return errorJson(400, 'El puntaje debe estar entre 1 y 5');
		const lista = (resenas[id] ??= []);
		lista.unshift({
			usuario_nombre: 'Vos (simulado)',
			puntaje,
			comentario: body.comentario ?? null,
			creado_en: new Date().toISOString()
		});
		const e = empresas.find((x) => x.id === id);
		if (e) {
			e.calificacion_cantidad = lista.length;
			e.calificacion_promedio =
				Math.round((lista.reduce((a, r) => a + r.puntaje, 0) / lista.length) * 10) / 10;
		}
		return json({ message: 'Calificación registrada' });
	}
	if (method === 'POST' && (m = pathname.match(/^\/empresas\/(\d+)\/reportes$/))) {
		const e = empresas.find((x) => x.id === Number(m![1]));
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
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/(\d+)\/verificado$/))) {
		const e = empresas.find((x) => x.id === Number(m![1]));
		if (!e) return errorJson(404, 'Empresa no encontrada');
		e.verificado = !!body.verificado;
		return json({ verificado: e.verificado });
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
					nombre: e.nombre,
					lat: e.lat,
					lng: e.lng,
					categoria_id: e.categoria_id,
					verificado: !!e.verificado
				}))
		);
	}
	if (method === 'GET' && pathname === '/empresas') {
		const q = (params.get('q') ?? '').trim().toLowerCase();
		const cat = params.get('categoria_id');
		const admin = params.get('admin_id');
		const limit = params.get('limit') ? Number(params.get('limit')) : undefined;
		const offset = Number(params.get('offset') ?? 0);
		const filtradas = empresas.filter(
			(e) =>
				(!q ||
					e.nombre.toLowerCase().includes(q) ||
					(e.categoria ?? '').toLowerCase().includes(q)) &&
				(!cat || String(e.categoria_id) === cat) &&
				(!admin || String(e.admin_id) === admin)
		);
		return json(limit ? filtradas.slice(offset, offset + limit) : filtradas.slice(offset));
	}
	if (method === 'POST' && pathname === '/empresas') {
		const categoria = categorias.find((c) => c.id === Number(body.categoria_id));
		const nueva: Empresa = {
			id: nextEmpresaId++,
			nombre: body.nombre,
			direccion: body.direccion,
			telefono: body.telefono,
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
			turnos_habilitados: body.turnos_habilitados ?? true
		};
		empresas = [...empresas, nueva];
		horarios[nueva.id] = {};
		telefonos[nueva.id] = [];
		return json(nueva, 201);
	}
	if (method === 'GET' && (m = pathname.match(/^\/empresas\/(\d+)$/))) {
		const empresa = empresas.find((e) => e.id === Number(m![1]));
		if (!empresa) return errorJson(404, 'Empresa no encontrada');
		return json({ ...empresa, telefonos: telefonos[empresa.id] ?? [] });
	}
	if (method === 'PUT' && (m = pathname.match(/^\/empresas\/(\d+)$/))) {
		const id = Number(m[1]);
		const idx = empresas.findIndex((e) => e.id === id);
		if (idx === -1) return errorJson(404, 'Empresa no encontrada');
		const categoria = categorias.find((c) => c.id === Number(body.categoria_id));
		empresas[idx] = {
			...empresas[idx],
			...body,
			duracion_turno_min:
				body.duracion_turno_min !== undefined && body.duracion_turno_min !== ''
					? Number(body.duracion_turno_min)
					: empresas[idx].duracion_turno_min,
			categoria_id: Number(body.categoria_id),
			categoria: categoria?.nombre ?? empresas[idx].categoria,
			fotos: body.fotos ?? empresas[idx].fotos,
			turnos_habilitados: body.turnos_habilitados ?? empresas[idx].turnos_habilitados ?? true
		};
		return json(empresas[idx]);
	}

	// ---------- Turnos ----------
	if (method === 'GET' && pathname === '/turnos/mis-turnos') {
		return json(turnos.map(({ empresa_id, ...t }) => t));
	}
	if (method === 'GET' && pathname === '/turnos/ocupados') {
		const key = `${params.get('empresa_id')}_${params.get('fecha')}`;
		return json((ocupados[key] ?? []).map((hora) => ({ hora })));
	}
	if (method === 'POST' && pathname === '/turnos/reservar') {
		const { empresa_id, fecha, hora } = body;
		const key = `${empresa_id}_${fecha}`;
		ocupados[key] = [...(ocupados[key] ?? []), hora];
		const empresa = empresas.find((e) => e.id === Number(empresa_id));
		const turno: TurnoInterno = {
			id: nextTurnoId++,
			fecha,
			hora,
			estado: 'confirmado',
			empresa_nombre: empresa?.nombre ?? '',
			empresa_id: Number(empresa_id)
		};
		turnos = [...turnos, turno];
		return json(turno, 201);
	}
	if (method === 'DELETE' && (m = pathname.match(/^\/turnos\/cancelar\/(\d+)$/))) {
		const id = Number(m[1]);
		turnos = turnos.filter((t) => t.id !== id);
		return json({ message: 'Turno cancelado correctamente' });
	}

	// ---------- Auth ----------
	if (method === 'POST' && pathname === '/auth/login') {
		const usuario =
			Object.values(usuariosSeed).find((u) => u.email === body.email) ?? usuariosSeed.cliente;
		return json({ message: 'Inicio de sesión exitoso', token: 'mock-token', user: usuario });
	}
	if (method === 'POST' && pathname === '/auth/register') {
		const nuevo = {
			id: nextUsuarioId++,
			nombre: body.nombre,
			email: body.email,
			rol: 'cliente' as const
		};
		return json({ message: 'Registro exitoso', token: 'mock-token', user: nuevo }, 201);
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
