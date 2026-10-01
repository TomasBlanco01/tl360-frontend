import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Empresa } from '$lib/types';

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
		expect(mios).toHaveLength(1);
		expect(mios[0]).toMatchObject({ fecha: '2026-10-13', hora: '10:00', estado: 'confirmado' });
		expect(mios[0].empresa_id).toBeUndefined();
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
		expect((await llamar('GET', '/turnos/mis-turnos')).data).toEqual([]);
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

describe('mock: rutas desconocidas', () => {
	it('responden 404 indicando método y ruta', async () => {
		const { llamar } = await nuevo();
		const r = await llamar('GET', '/no-existe');
		expect(r.status).toBe(404);
		expect(r.data.message).toContain('GET /no-existe');
	});
});
