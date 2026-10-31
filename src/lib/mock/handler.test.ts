import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Empresa } from '$lib/types';
import { hoyISO, sumarDias } from '$lib/_auditoria/fechas';

// El handler guarda su estado a nivel de módulo: cada test parte de un módulo nuevo.
async function nuevo() {
	vi.resetModules();
	const { mockFetch } = await import('./handler');
	const data = await import('./data');
	async function llamar(metodo: string, ruta: string, cuerpo?: unknown) {
		const promesa = mockFetch(ruta, {
			method: metodo,
			body: cuerpo ? JSON.stringify(cuerpo) : undefined
		});
		await vi.advanceTimersByTimeAsync(300);
		const res = await promesa;
		return { status: res.status, data: await res.json() };
	}
	return { llamar, data };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('mock: rubros', () => {
	it('lista los rubros de ejemplo', async () => {
		const { llamar, data } = await nuevo();
		const r = await llamar('GET', '/categorias');
		expect(r.status).toBe(200);
		expect(r.data).toHaveLength(data.categoriasSeed.length);
	});

	it('crea, renombra y elimina', async () => {
		const { llamar } = await nuevo();
		const creada = await llamar('POST', '/categorias', { nombre: 'Rubro nuevo' });
		expect(creada.status).toBe(201);
		const id = creada.data.id;
		expect((await llamar('PUT', `/categorias/${id}`, { nombre: 'Renombrado' })).data.nombre).toBe(
			'Renombrado'
		);
		expect((await llamar('DELETE', `/categorias/${id}`)).status).toBe(200);
		const lista = (await llamar('GET', '/categorias')).data as { id: number }[];
		expect(lista.some((c) => c.id === id)).toBe(false);
	});

	it('renombrar un rubro inexistente da 404', async () => {
		const { llamar } = await nuevo();
		expect((await llamar('PUT', '/categorias/99999', { nombre: 'x' })).status).toBe(404);
	});
});

describe('mock: comercios', () => {
	it('lista todo sin filtros', async () => {
		const { llamar, data } = await nuevo();
		expect((await llamar('GET', '/empresas')).data).toHaveLength(data.empresasSeed.length);
	});

	it('filtra por texto (nombre o rubro), sin distinguir mayúsculas', async () => {
		const { llamar } = await nuevo();
		const r = (await llamar('GET', '/empresas?q=GIMNASIO')).data as Empresa[];
		expect(r.length).toBeGreaterThan(0);
		expect(r.every((e) => /gimnasio/i.test(e.nombre) || /gimnasio/i.test(e.categoria ?? ''))).toBe(
			true
		);
	});

	it('filtra por rubro y por dueño', async () => {
		const { llamar } = await nuevo();
		const porRubro = (await llamar('GET', '/empresas?categoria_id=1')).data as Empresa[];
		expect(porRubro.length).toBeGreaterThan(0);
		expect(porRubro.every((e) => e.categoria_id === 1)).toBe(true);
		const propias = (await llamar('GET', '/empresas?admin_id=101')).data as Empresa[];
		expect(propias.length).toBeGreaterThan(0);
		expect(propias.every((e) => e.admin_id === 101)).toBe(true);
		expect((await llamar('GET', '/empresas?admin_id=424242')).data).toEqual([]);
	});

	it('pagina con limit y offset', async () => {
		const { llamar, data } = await nuevo();
		const primeros = (await llamar('GET', '/empresas?limit=3')).data as Empresa[];
		expect(primeros.map((e) => e.id)).toEqual(data.empresasSeed.slice(0, 3).map((e) => e.id));
		const siguientes = (await llamar('GET', '/empresas?limit=3&offset=3')).data as Empresa[];
		expect(siguientes.map((e) => e.id)).toEqual(data.empresasSeed.slice(3, 6).map((e) => e.id));
	});

	it('RF-07: con lat/lng ordena abiertos primero y luego por distancia', async () => {
		const { llamar } = await nuevo();
		const todos = (await llamar('GET', '/empresas')).data as Empresa[];
		const referencia = todos.find((e) => e.lat != null && e.lng != null)!;
		const cercanos = (await llamar('GET', `/empresas?lat=${referencia.lat}&lng=${referencia.lng}`))
			.data as Empresa[];
		const propia = cercanos.find((e) => e.id === referencia.id)!;
		expect(propia.distancia_km).toBeCloseTo(0, 5);
		expect(cercanos.every((e) => e.distancia_km != null)).toBe(true);
		for (let i = 1; i < cercanos.length; i++) {
			if (cercanos[i].abierto_ahora === cercanos[i - 1].abierto_ahora) {
				expect(cercanos[i].distancia_km!).toBeGreaterThanOrEqual(
					cercanos[i - 1].distancia_km! - 1e-9
				);
			}
		}
		const ultimoAbierto = cercanos.findLastIndex((e) => e.abierto_ahora === true);
		const primerCerrado = cercanos.findIndex((e) => e.abierto_ahora === false);
		if (ultimoAbierto >= 0 && primerCerrado >= 0) {
			expect(ultimoAbierto).toBeLessThan(primerCerrado);
		}
		expect((await llamar('GET', '/empresas?lat=-35.97')).status).toBe(400);
	});

	it('la ficha incluye los teléfonos y un id inexistente da 404', async () => {
		const { llamar } = await nuevo();
		const ficha = await llamar('GET', '/empresas/1');
		expect(ficha.status).toBe(200);
		expect(Array.isArray(ficha.data.telefonos)).toBe(true);
		expect((await llamar('GET', '/empresas/999999')).status).toBe(404);
	});

	it('crea y edita un comercio', async () => {
		const { llamar } = await nuevo();
		const creada = await llamar('POST', '/empresas', {
			nombre: 'Mi local',
			direccion: 'Calle 1',
			telefono: '2392000000',
			categoria_id: 1,
			duracion_turno_min: '30'
		});
		expect(creada.status).toBe(201);
		expect(creada.data.categoria).toBe('Peluquería');
		expect(creada.data.duracion_turno_min).toBe(30);
		expect(creada.data.turnos_habilitados).toBe(true);
		const editada = await llamar('PUT', `/empresas/${creada.data.id}`, {
			nombre: 'Otro nombre',
			categoria_id: 2
		});
		expect(editada.data.nombre).toBe('Otro nombre');
		expect(editada.data.categoria).toBe('Gimnasio');
		expect((await llamar('PUT', '/empresas/999999', { categoria_id: 1 })).status).toBe(404);
	});

	it('horarios y teléfonos se guardan y se leen', async () => {
		const { llamar } = await nuevo();
		await llamar('PUT', '/empresas/1/horarios', { horarios: { Lunes: ['09:00-12:00'] } });
		expect((await llamar('GET', '/empresas/horarios/1')).data).toEqual({ Lunes: ['09:00-12:00'] });
		const tels = await llamar('PUT', '/empresas/1/telefonos', {
			telefonos: [{ numero: '111', etiqueta: 'Turnos' }, { numero: '222' }]
		});
		expect(tels.data.map((t: { id: number }) => t.id)).toEqual([1, 2]);
		expect((await llamar('GET', '/empresas/1/telefonos')).data).toHaveLength(2);
	});
});

describe('mock: turnos', () => {
	const reserva = { empresa_id: 1, fecha: '2026-10-13', hora: '10:00' };

	it('reservar deja el horario ocupado y lo suma a mis turnos', async () => {
		const { llamar } = await nuevo();
		const r = await llamar('POST', '/turnos/reservar', reserva);
		expect(r.status).toBe(201);
		expect((await llamar('GET', '/turnos/ocupados?empresa_id=1&fecha=2026-10-13')).data).toEqual([
			{ hora: '10:00' }
		]);
		const mios = (await llamar('GET', '/turnos/mis-turnos')).data;
		// El mock arranca con un turno histórico (para RF-13) más el recién reservado.
		expect(mios).toHaveLength(2);
		const reservado = mios.find((t: { id: number }) => t.id !== 9000);
		expect(reservado).toMatchObject({ fecha: '2026-10-13', hora: '10:00', estado: 'confirmado' });
		// 1.5/2.6 El turno trae el comercio para enlazar a la ficha sin otro fetch.
		expect(reservado.empresa_id).toBe(1);
	});

	it('los horarios ocupados son por comercio y por día', async () => {
		const { llamar } = await nuevo();
		await llamar('POST', '/turnos/reservar', reserva);
		expect((await llamar('GET', '/turnos/ocupados?empresa_id=2&fecha=2026-10-13')).data).toEqual(
			[]
		);
		expect((await llamar('GET', '/turnos/ocupados?empresa_id=1&fecha=2026-10-14')).data).toEqual(
			[]
		);
	});

	it('cancelar quita el turno', async () => {
		const { llamar } = await nuevo();
		const id = (await llamar('POST', '/turnos/reservar', reserva)).data.id;
		expect((await llamar('DELETE', `/turnos/cancelar/${id}`)).status).toBe(200);
		const mios = (await llamar('GET', '/turnos/mis-turnos')).data;
		expect(mios).toHaveLength(1);
		expect(mios[0].id).toBe(9000);
	});

	it('RF-13: el turno histórico se califica una sola vez y queda marcado', async () => {
		const { llamar } = await nuevo();
		const antes = (await llamar('GET', '/turnos/mis-turnos')).data;
		expect(antes[0]).toMatchObject({ id: 9000, calificado: false });
		expect(
			(
				await llamar('POST', '/empresas/1/calificaciones', {
					turno_id: 9000,
					puntaje: 5,
					comentario: 'Genial'
				})
			).status
		).toBe(200);
		expect((await llamar('GET', '/turnos/mis-turnos')).data[0].calificado).toBe(true);
		// Recalificar el mismo turno actualiza la reseña, no la duplica.
		expect(
			(await llamar('POST', '/empresas/1/calificaciones', { turno_id: 9000, puntaje: 4 })).status
		).toBe(200);
		const resenas = (await llamar('GET', '/empresas/1/calificaciones')).data;
		expect(resenas).toHaveLength(1);
		expect(resenas[0].puntaje).toBe(4);
	});

	it('RF-13: exige un turno propio, del comercio y ya pasado', async () => {
		const { llamar } = await nuevo();
		expect((await llamar('POST', '/empresas/1/calificaciones', { puntaje: 5 })).status).toBe(400);
		expect(
			(await llamar('POST', '/empresas/1/calificaciones', { turno_id: 424242, puntaje: 5 })).status
		).toBe(404);
		expect(
			(await llamar('POST', '/empresas/2/calificaciones', { turno_id: 9000, puntaje: 5 })).status
		).toBe(400);
		const futuro = new Date();
		futuro.setDate(futuro.getDate() + 7);
		const fecha = `${futuro.getFullYear()}-${String(futuro.getMonth() + 1).padStart(2, '0')}-${String(futuro.getDate()).padStart(2, '0')}`;
		const turno = (
			await llamar('POST', '/turnos/reservar', { empresa_id: 1, fecha, hora: '10:00' })
		).data;
		expect(
			(await llamar('POST', '/empresas/1/calificaciones', { turno_id: turno.id, puntaje: 5 }))
				.status
		).toBe(400);
	});

	it('cancelar libera el slot para otros clientes (1.5)', async () => {
		const { llamar } = await nuevo();
		const id = (await llamar('POST', '/turnos/reservar', reserva)).data.id;
		expect((await llamar('GET', '/turnos/ocupados?empresa_id=1&fecha=2026-10-13')).data).toEqual([
			{ hora: '10:00' }
		]);
		await llamar('DELETE', `/turnos/cancelar/${id}`);
		expect((await llamar('GET', '/turnos/ocupados?empresa_id=1&fecha=2026-10-13')).data).toEqual(
			[]
		);
	});

	it('reservar dos veces el mismo slot da 409 (concurrencia)', async () => {
		const { llamar } = await nuevo();
		expect((await llamar('POST', '/turnos/reservar', reserva)).status).toBe(201);
		const doble = await llamar('POST', '/turnos/reservar', reserva);
		expect(doble.status).toBe(409);
	});
});

describe('mock: cuentas', () => {
	it('el login reconoce a los usuarios de ejemplo por correo', async () => {
		const { llamar, data } = await nuevo();
		const r = await llamar('POST', '/auth/login', {
			email: data.usuariosSeed.admin.email,
			contraseña: 'x'
		});
		expect(r.data.user.rol).toBe('admin');
		expect(r.data.token).toBeTruthy();
		const su = await llamar('POST', '/auth/login', {
			email: data.usuariosSeed.superadmin.email,
			contraseña: 'x'
		});
		expect(su.data.user.rol).toBe('superadmin');
	});

	it('un correo desconocido entra como cliente de ejemplo', async () => {
		const { llamar } = await nuevo();
		expect(
			(await llamar('POST', '/auth/login', { email: 'otro@x.com', contraseña: 'x' })).data.user.rol
		).toBe('cliente');
	});

	it('el registro devuelve un cliente nuevo con id propio', async () => {
		const { llamar } = await nuevo();
		const a = await llamar('POST', '/auth/register', {
			nombre: 'Ana',
			email: 'a@b.com',
			contraseña: '123456'
		});
		const b = await llamar('POST', '/auth/register', {
			nombre: 'Beto',
			email: 'b@b.com',
			contraseña: '123456'
		});
		expect(a.status).toBe(201);
		expect(a.data.user).toMatchObject({ nombre: 'Ana', rol: 'cliente' });
		expect(a.data.user.id).not.toBe(b.data.user.id);
	});

	it('recuperar contraseña responde siempre lo mismo', async () => {
		const { llamar } = await nuevo();
		expect((await llamar('POST', '/auth/forgot-password', { email: 'x@y.com' })).status).toBe(200);
		expect(
			(await llamar('POST', '/auth/reset-password', { token: 't', contraseña: '123456' })).status
		).toBe(200);
	});
});

describe('mock: recordatorio configurable (RF-03)', () => {
	it('lee, actualiza y valida la anticipación', async () => {
		const { llamar } = await nuevo();
		expect((await llamar('GET', '/usuarios/yo/recordatorio')).data).toEqual({ horas: 24 });
		expect((await llamar('PUT', '/usuarios/yo/recordatorio', { horas: 6 })).data).toEqual({
			horas: 6
		});
		expect((await llamar('GET', '/usuarios/yo/recordatorio')).data).toEqual({ horas: 6 });
		expect((await llamar('PUT', '/usuarios/yo/recordatorio', { horas: 0 })).status).toBe(400);
		expect((await llamar('PUT', '/usuarios/yo/recordatorio', { horas: 169 })).status).toBe(400);
	});
});

describe('mock: verificación de correo (RF-01)', () => {
	it('el registro nace sin verificar y el enlace de ejemplo verifica', async () => {
		const { llamar } = await nuevo();
		const reg = await llamar('POST', '/auth/register', {
			nombre: 'Nueva',
			email: 'nueva@b.com',
			contraseña: 'Clave123'
		});
		expect(reg.status).toBe(201);
		expect(reg.data.user.email_verificado).toBe(false);
		expect(reg.data.token_verificacion).toBeTruthy();
		const login = await llamar('POST', '/auth/login', { email: 'nueva@b.com' });
		expect(login.data.user.email_verificado).toBe(false);
		const ver = await llamar('POST', '/auth/verificar-email', {
			token: reg.data.token_verificacion
		});
		expect(ver.status).toBe(200);
		expect(
			(await llamar('POST', '/auth/login', { email: 'nueva@b.com' })).data.user.email_verificado
		).toBe(true);
	});

	it('un token desconocido da 400 y el reenvío no revela cuentas', async () => {
		const { llamar } = await nuevo();
		expect((await llamar('POST', '/auth/verificar-email', { token: 'no-existe' })).status).toBe(
			400
		);
		const a = await llamar('POST', '/auth/reenviar-verificacion', { email: 'nadie@x.com' });
		const b = await llamar('POST', '/auth/reenviar-verificacion', {
			email: 'cliente@demo.com'
		});
		expect(a.data.message).toBe(b.data.message);
		expect(a.data.token_verificacion).toBeUndefined();
	});
});

describe('mock: canal público de difusión (RF-06)', () => {
	it('recibe una solicitud sin sesión y evita duplicados pendientes', async () => {
		const { llamar } = await nuevo();
		const nueva = {
			nombre: 'Feria del barrio',
			contacto: 'feria@demo.com',
			tipo: 'colecta',
			mensaje: 'Feria de emprendedores el sábado en la plaza.'
		};
		expect((await llamar('POST', '/solicitudes-publicidad', nueva)).status).toBe(201);
		const repetida = await llamar('POST', '/solicitudes-publicidad', {
			...nueva,
			contacto: 'FERIA@demo.com'
		});
		expect(repetida.status).toBe(409);
	});

	it('valida tipo y largo del mensaje', async () => {
		const { llamar } = await nuevo();
		const base = {
			nombre: 'Ana',
			contacto: '11 5555-1234',
			mensaje: 'Mensaje suficientemente largo'
		};
		expect(
			(await llamar('POST', '/solicitudes-publicidad', { ...base, tipo: 'sorteo' })).status
		).toBe(400);
		expect(
			(await llamar('POST', '/solicitudes-publicidad', { ...base, mensaje: 'corto' })).status
		).toBe(400);
	});

	it('la bandeja muestra pendientes y el admin las resuelve', async () => {
		const { llamar } = await nuevo();
		const pendientes = (await llamar('GET', '/solicitudes-publicidad')).data as { id: number }[];
		expect(pendientes.length).toBeGreaterThan(0);
		const id = pendientes[0].id;
		expect(
			(await llamar('PUT', `/solicitudes-publicidad/${id}`, { estado: 'atendida' })).status
		).toBe(200);
		const ahora = (await llamar('GET', '/solicitudes-publicidad')).data as { id: number }[];
		expect(ahora.some((s) => s.id === id)).toBe(false);
		const todas = (await llamar('GET', '/solicitudes-publicidad?todas=true')).data as {
			id: number;
		}[];
		expect(todas.some((s) => s.id === id)).toBe(true);
	});
});

describe('mock: colectas sin comercio (RF-06)', () => {
	it('el carrusel incluye una colecta de la plataforma y se puede crear otra', async () => {
		const { llamar } = await nuevo();
		const lista = (await llamar('GET', '/publicidades')).data as { empresa_id: number | null }[];
		expect(lista.some((p) => p.empresa_id === null)).toBe(true);
		const nueva = await llamar('POST', '/publicidades', {
			empresa_id: null,
			titulo: 'Colecta para el merendero',
			descripcion: 'Juntamos leche y galletitas',
			imagen_url: 'https://x.com/colecta.jpg'
		});
		expect(nueva.status).toBe(201);
		expect(nueva.data.empresa_id).toBeNull();
	});
});

describe('mock: atenciones de mostrador (RF-04)', () => {
	it('registra, resume y elimina una atención', async () => {
		const { llamar } = await nuevo();
		const alta = await llamar('POST', '/empresas/2/atenciones', {
			cantidad: 4,
			importe: 1000.5,
			nota: 'Corte + barba'
		});
		expect(alta.status).toBe(201);

		const lista = (await llamar('GET', '/empresas/2/atenciones')).data;
		expect(lista.atenciones[0]).toMatchObject({
			cantidad: 4,
			importe: 1000.5,
			nota: 'Corte + barba'
		});
		expect(lista.resumen).toEqual({
			hoy_cantidad: 4,
			hoy_importe: 1000.5,
			mes_cantidad: 4,
			mes_importe: 1000.5,
			total_cantidad: 4,
			total_importe: 1000.5
		});

		expect((await llamar('DELETE', `/empresas/2/atenciones/${alta.data.id}`)).status).toBe(200);
		const vacio = (await llamar('GET', '/empresas/2/atenciones')).data;
		expect(vacio.atenciones).toEqual([]);
		expect(vacio.resumen.total_cantidad).toBe(0);
	});

	it('valida cantidad, importe y fecha futura', async () => {
		const { llamar } = await nuevo();
		for (const cuerpo of [
			{ cantidad: 0 },
			{ cantidad: 1, importe: 0 },
			{ cantidad: 1, fecha: sumarDias(hoyISO(), 1) }
		]) {
			expect((await llamar('POST', '/empresas/2/atenciones', cuerpo)).status).toBe(400);
		}
	});
});

describe('mock: rechazo de verificación con motivo (RF-15)', () => {
	it('rechazar exige motivo, lo guarda y una nueva solicitud lo limpia', async () => {
		const { llamar } = await nuevo();
		const sinMotivo = await llamar('PUT', '/empresas/1/verificacion', { accion: 'rechazar' });
		expect(sinMotivo.status).toBe(400);
		const ok = await llamar('PUT', '/empresas/1/verificacion', {
			accion: 'rechazar',
			motivo: 'Constancia vencida'
		});
		expect(ok.data.verificado_estado).toBe('rechazado');
		expect((await llamar('GET', '/empresas/1')).data.motivo_rechazo).toBe('Constancia vencida');
		await llamar('PUT', '/empresas/1/verificacion', { accion: 'solicitar', cuit: '20123456786' });
		const ficha = (await llamar('GET', '/empresas/1')).data;
		expect(ficha.verificado_estado).toBe('pendiente');
		expect(ficha.verificado).toBe(false);
		expect(ficha.motivo_rechazo).toBeUndefined();
	});
});

describe('mock: turnos agendados por el comercio (RF-04)', () => {
	it('agenda para alguien sin cuenta, ocupa el horario y se puede cancelar', async () => {
		const { llamar } = await nuevo();
		const fecha = sumarDias(hoyISO(), 5);
		expect(
			(await llamar('POST', '/empresas/1/turnos', { fecha, hora: '10:00', cliente_nombre: ' ' }))
				.status
		).toBe(400);
		const creado = await llamar('POST', '/empresas/1/turnos', {
			fecha,
			hora: '10:00',
			cliente_nombre: 'Carlos Medina',
			cliente_email: 'carlos@ejemplo.com'
		});
		expect(creado.status).toBe(201);
		const lista = (await llamar('GET', '/empresas/1/turnos')).data;
		expect(lista).toContainEqual(
			expect.objectContaining({
				id: creado.data.id,
				cliente_nombre: 'Carlos Medina',
				cliente_email: 'carlos@ejemplo.com',
				sin_cuenta: true
			})
		);
		// El mismo horario ya no se puede reservar ni volver a agendar.
		expect(
			(await llamar('POST', '/turnos/reservar', { empresa_id: 1, fecha, hora: '10:00' })).status
		).toBe(409);
		await llamar('DELETE', `/turnos/cancelar/${creado.data.id}`);
		expect(
			(await llamar('POST', '/turnos/reservar', { empresa_id: 1, fecha, hora: '10:00' })).status
		).toBe(201);
	});

	it('las reservas del cliente demo llegan al comercio con nombre y correo', async () => {
		const { llamar } = await nuevo();
		await llamar('POST', '/turnos/reservar', {
			empresa_id: 1,
			fecha: sumarDias(hoyISO(), 5),
			hora: '11:00'
		});
		const turno = (await llamar('GET', '/empresas/1/turnos')).data.find(
			(t: { hora: string }) => t.hora === '11:00'
		);
		expect(turno).toMatchObject({
			cliente_nombre: 'Martina Gómez',
			cliente_email: 'cliente@demo.com',
			sin_cuenta: false
		});
	});
});

describe('mock: rutas desconocidas', () => {
	it('responden 404 indicando método y ruta', async () => {
		const { llamar } = await nuevo();
		const r = await llamar('GET', '/no-existe');
		expect(r.status).toBe(404);
		expect(r.data.message).toContain('GET /no-existe');
	});
});
