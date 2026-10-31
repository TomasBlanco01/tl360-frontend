import { api, ApiError } from '$lib/api';

export type EstadoPush = 'no-soportado' | 'desactivado' | 'activo' | 'bloqueado';

/** Web Push necesita service worker, PushManager y permisos de notificaciones. */
export function soportado(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

/** La clave VAPID llega en base64url sin padding; `subscribe` pide bytes. */
export function base64AArrayBuffer(valor: string): Uint8Array {
	const base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
	const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
	const binario = atob(base64 + relleno);
	return Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
}

export async function detectarEstado(): Promise<EstadoPush> {
	if (!soportado()) return 'no-soportado';
	if (Notification.permission === 'denied') return 'bloqueado';
	const registro = await navigator.serviceWorker.getRegistration();
	const suscripcion = await registro?.pushManager.getSubscription();
	return suscripcion ? 'activo' : 'desactivado';
}

async function clavePublica(): Promise<string | null> {
	try {
		const res = await api.get<{ clave_publica: string }>('/push/clave-publica');
		return res.clave_publica;
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) return null;
		throw err;
	}
}

async function registroListo(): Promise<ServiceWorkerRegistration> {
	const existente = await navigator.serviceWorker.getRegistration();
	return existente ?? navigator.serviceWorker.ready;
}

/** Pide permiso, suscribe este navegador y guarda la suscripción en el backend. */
export async function activar(): Promise<void> {
	if (!soportado()) throw new Error('Este navegador no soporta notificaciones push.');
	if (Notification.permission === 'denied') {
		throw new Error('Las notificaciones están bloqueadas para este sitio.');
	}
	const clave = await clavePublica();
	if (!clave) {
		throw new Error('El servidor todavía no tiene configuradas las notificaciones push.');
	}
	const permiso =
		Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
	if (permiso !== 'granted') throw new Error('No se concedió permiso para mostrar notificaciones.');

	const registro = await registroListo();
	let suscripcion = await registro.pushManager.getSubscription();
	if (!suscripcion) {
		const bytes = base64AArrayBuffer(clave);
		suscripcion = await registro.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: bytes.buffer as ArrayBuffer
		});
	}
	const datos = suscripcion.toJSON();
	if (!datos.endpoint || !datos.keys?.p256dh || !datos.keys.auth) {
		throw new Error('El navegador devolvió una suscripción incompleta.');
	}
	await api.post('/push/suscripciones', {
		endpoint: datos.endpoint,
		keys: { p256dh: datos.keys.p256dh, auth: datos.keys.auth }
	});
}

/** Baja la suscripción en el backend y en el navegador (idempotente). */
export async function desactivar(): Promise<void> {
	if (!soportado()) return;
	const registro = await navigator.serviceWorker.getRegistration();
	const suscripcion = await registro?.pushManager.getSubscription();
	if (!suscripcion) return;
	try {
		await api.delete('/push/suscripciones', { endpoint: suscripcion.endpoint });
	} catch (err) {
		if (!(err instanceof ApiError && err.status === 404)) throw err;
	}
	await suscripcion.unsubscribe();
}
