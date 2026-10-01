import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conModoMock, respuesta } from '../tests/helpers';

type ErrorHttp = { message: string; status: number };
/** Espera que la promesa falle y devuelve el error tipado. */
const fallo = (p: Promise<unknown>) =>
	p.then(
		() => {
			throw new Error('se esperaba un error');
		},
		(e) => e as ErrorHttp
	);
const fetchMock = vi.fn();
// Una respuesta nueva por llamada: el cuerpo de una Response solo se puede leer una vez.
const responder = (status: number, cuerpo?: unknown) =>
	fetchMock.mockImplementation(async () => respuesta(status, cuerpo));

async function cargar(modo: 'true' | 'false' = 'false') {
	const { api, ApiError } = await conModoMock(modo, () => import('./api'));
	const { auth } = await import('./stores/auth.svelte');
	return { api, ApiError, auth };
}

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
	fetchMock.mockReset();
});

describe('api (backend real)', () => {
	it('arma la URL con la base configurada y /api', async () => {
		responder(200, []);
		const { api } = await cargar();
		await api.get('/empresas?limit=6');
		expect(fetchMock).toHaveBeenCalledWith(
			'http://api.test/api/empresas?limit=6',
			expect.anything()
		);
	});

	it('un GET sin sesión no manda Authorization ni Content-Type', async () => {
		responder(200, {});
		const { api } = await cargar();
		await api.get('/categorias');
		const headers: Headers = fetchMock.mock.calls[0][1].headers;
		expect(headers.get('Authorization')).toBeNull();
		expect(headers.get('Content-Type')).toBeNull();
	});

	it('con sesión manda el token como Bearer', async () => {
		responder(200, {});
		const { api, auth } = await cargar();
		auth.login('tok-123', { id: 1, nombre: 'Ana', email: 'a@b.com', rol: 'cliente' });
		await api.get('/turnos/mis-turnos');
		expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer tok-123');
	});

	it('POST y PUT mandan el cuerpo como JSON', async () => {
		responder(200, {});
		const { api } = await cargar();
		await api.post('/auth/login', { email: 'a@b.com', contraseña: 'x' });
		await api.put('/empresas/1', { nombre: 'N' });
		const [post, put] = fetchMock.mock.calls;
		expect(post[1].method).toBe('POST');
		expect(post[1].body).toBe(JSON.stringify({ email: 'a@b.com', contraseña: 'x' }));
		expect(post[1].headers.get('Content-Type')).toBe('application/json');
		expect(put[1].method).toBe('PUT');
		expect(put[1].body).toBe(JSON.stringify({ nombre: 'N' }));
	});

	it('un POST sin datos no manda cuerpo', async () => {
		responder(200, {});
		const { api } = await cargar();
		await api.post('/algo');
		expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
	});

	it('DELETE usa ese método', async () => {
		responder(200, {});
		const { api } = await cargar();
		await api.delete('/turnos/cancelar/5');
		expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
	});

	it('devuelve el JSON de la respuesta', async () => {
		responder(200, [{ id: 1 }]);
		const { api } = await cargar();
		expect(await api.get('/empresas')).toEqual([{ id: 1 }]);
	});

	it('una respuesta 204 devuelve undefined', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
		const { api } = await cargar();
		expect(await api.delete('/x')).toBeUndefined();
	});

	describe('errores', () => {
		it('usa el campo `error` del backend Rust', async () => {
			responder(409, { error: 'Turno ya ocupado' });
			const { api, ApiError } = await cargar();
			const err = await fallo(api.post('/turnos/reservar', {}));
			expect(err).toBeInstanceOf(ApiError);
			expect(err.message).toBe('Turno ya ocupado');
			expect(err.status).toBe(409);
		});

		it('prefiere `message` si vienen los dos', async () => {
			responder(400, { message: 'uno', error: 'dos' });
			const { api } = await cargar();
			expect((await fallo(api.get('/x'))).message).toBe('uno');
		});

		it('si el cuerpo no es JSON, informa el código', async () => {
			fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
			const { api } = await cargar();
			expect((await fallo(api.get('/x'))).message).toBe('Error 500');
		});

		it('un 401 cierra la sesión', async () => {
			responder(401, { error: 'Token inválido o expirado' });
			const { api, auth } = await cargar();
			auth.login('vencido', { id: 1, nombre: 'Ana', email: 'a@b.com', rol: 'cliente' });
			await api.get('/turnos/mis-turnos').catch(() => {});
			expect(auth.token).toBeNull();
			expect(auth.user).toBeNull();
		});

		it('otros errores no cierran la sesión', async () => {
			responder(403, { error: 'No tenés permisos' });
			const { api, auth } = await cargar();
			auth.login('valido', { id: 1, nombre: 'Ana', email: 'a@b.com', rol: 'cliente' });
			await api.get('/usuarios').catch(() => {});
			expect(auth.token).toBe('valido');
		});
	});
});

describe('api (modo mock)', () => {
	it('no usa la red: responde con el backend en memoria', async () => {
		vi.useFakeTimers();
		const { api } = await cargar('true');
		const promesa = api.get<{ id: number }[]>('/categorias');
		await vi.advanceTimersByTimeAsync(300);
		expect((await promesa).length).toBeGreaterThan(5);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it('las rutas desconocidas fallan como un 404', async () => {
		vi.useFakeTimers();
		const { api } = await cargar('true');
		const promesa = fallo(api.get('/no-existe'));
		await vi.advanceTimersByTimeAsync(300);
		expect((await promesa).status).toBe(404);
		vi.useRealTimers();
	});
});
