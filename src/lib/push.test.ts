import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '$lib/api';
import { activar, base64AArrayBuffer, desactivar, detectarEstado, soportado } from './push';

vi.mock('$lib/api', () => {
	class ApiError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}
	return {
		ApiError,
		api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() }
	};
});

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const borrar = api.delete as ReturnType<typeof vi.fn>;
const teniaServiceWorker = 'serviceWorker' in navigator;
const teniaPushManager = 'PushManager' in window;
const teniaNotification = 'Notification' in window;

const endpoint = 'https://fcm.googleapis.com/fcm/send/prueba';
const auth = 'xS03Fi5ErfTNH_l9WHE9Ig';

function instalarNavegadorConPush(
	registro: {
		pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
	},
	permiso: NotificationPermission = 'granted'
) {
	Object.defineProperty(navigator, 'serviceWorker', {
		configurable: true,
		value: {
			getRegistration: vi.fn().mockResolvedValue(registro),
			ready: Promise.resolve(registro)
		}
	});
	(window as unknown as { PushManager: unknown }).PushManager = class {};
	(window as unknown as { Notification: unknown }).Notification = {
		permission: permiso,
		requestPermission: vi.fn().mockResolvedValue(permiso)
	};
}

function suscripcionFalsa() {
	return {
		endpoint,
		toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-de-prueba', auth } }),
		unsubscribe: vi.fn().mockResolvedValue(true)
	};
}

beforeEach(() => {
	get.mockReset();
	post.mockReset().mockResolvedValue({});
	borrar.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
	if (!teniaServiceWorker) {
		delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
	}
	if (!teniaPushManager) {
		delete (window as unknown as { PushManager?: unknown }).PushManager;
	}
	if (!teniaNotification) {
		delete (window as unknown as { Notification?: unknown }).Notification;
	}
});

describe('Web Push (RNF-04)', () => {
	it('en un entorno sin service worker no está soportado', async () => {
		expect(soportado()).toBe(false);
		expect(await detectarEstado()).toBe('no-soportado');
	});

	it('convierte la clave VAPID base64url a bytes', () => {
		expect([...base64AArrayBuffer('AQID')]).toEqual([1, 2, 3]);
		expect([...base64AArrayBuffer('-_8')]).toEqual([251, 255]);
	});

	it('detecta una suscripción existente como activa', async () => {
		const registro = {
			pushManager: {
				getSubscription: vi.fn().mockResolvedValue(suscripcionFalsa()),
				subscribe: vi.fn()
			}
		};
		instalarNavegadorConPush(registro);
		expect(await detectarEstado()).toBe('activo');
	});

	it('activa: pide permiso, suscribe y guarda la suscripción en el backend', async () => {
		const suscripcion = suscripcionFalsa();
		const registro = {
			pushManager: {
				getSubscription: vi.fn().mockResolvedValue(null),
				subscribe: vi.fn().mockResolvedValue(suscripcion)
			}
		};
		instalarNavegadorConPush(registro);
		get.mockResolvedValue({ clave_publica: 'AQID' });

		await activar();

		expect(registro.pushManager.subscribe).toHaveBeenCalledWith({
			userVisibleOnly: true,
			applicationServerKey: expect.anything()
		});
		const opciones = registro.pushManager.subscribe.mock.calls[0][0];
		expect([...new Uint8Array(opciones.applicationServerKey)]).toEqual([1, 2, 3]);
		expect(post).toHaveBeenCalledWith('/push/suscripciones', {
			endpoint,
			keys: { p256dh: 'p256dh-de-prueba', auth }
		});
	});

	it('activa: avisa si el servidor no tiene VAPID configurado', async () => {
		const registro = {
			pushManager: {
				getSubscription: vi.fn().mockResolvedValue(null),
				subscribe: vi.fn()
			}
		};
		instalarNavegadorConPush(registro);
		get.mockRejectedValue(new ApiError(404, 'push apagado'));

		await expect(activar()).rejects.toThrow('no tiene configuradas');
		expect(registro.pushManager.subscribe).not.toHaveBeenCalled();
	});

	it('desactiva: borra del backend y cancela la suscripción del navegador', async () => {
		const suscripcion = suscripcionFalsa();
		const registro = {
			pushManager: {
				getSubscription: vi.fn().mockResolvedValue(suscripcion),
				subscribe: vi.fn()
			}
		};
		instalarNavegadorConPush(registro);

		await desactivar();

		expect(borrar).toHaveBeenCalledWith('/push/suscripciones', { endpoint });
		expect(suscripcion.unsubscribe).toHaveBeenCalled();
	});
});
