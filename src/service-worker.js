/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `tl360-${version}`;
const PRECACHE = [...new Set([...build, ...files])];
const PRECACHE_PATHS = new Set(PRECACHE);
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((claves) =>
				Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave)))
			)
			.then(() => self.clients.claim())
	);
});

async function redPrimero(request) {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		// ssr=false: la navegación devuelve el mismo shell, así que es seguro guardarlo.
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch {
		const guardada = await cache.match(request);
		if (guardada) return guardada;
		return (await cache.match(OFFLINE)) ?? Response.error();
	}
}

async function cachePrimero(request) {
	const cache = await caches.open(CACHE);
	const guardada = await cache.match(request);
	if (guardada) return guardada;
	const response = await fetch(request);
	if (response.ok) cache.put(request, response.clone());
	return response;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	// Solo recursos propios: no interceptamos tiles, OSRM ni la API (datos siempre frescos).
	if (url.origin !== self.location.origin) return;
	if (request.mode === 'navigate') {
		event.respondWith(redPrimero(request));
		return;
	}
	if (url.pathname.startsWith('/api/')) return;
	if (PRECACHE_PATHS.has(url.pathname)) event.respondWith(cachePrimero(request));
});

// RNF-04: notificaciones push (recordatorios de turnos y avisos del comercio/superadmin).
self.addEventListener('push', (event) => {
	let datos = {};
	try {
		datos = event.data ? event.data.json() : {};
	} catch {
		datos = {};
	}
	const opciones = {
		body: datos.body ?? '',
		icon: datos.icon ?? '/icons/icon-192.png',
		badge: datos.badge ?? '/icons/icon-192.png',
		data: { url: datos.url ?? '/' }
	};
	event.waitUntil(self.registration.showNotification(datos.title ?? 'TL360', opciones));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const destino = event.notification.data?.url ?? '/';
	event.waitUntil(
		(async () => {
			const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const cliente of clientes) {
				if ('focus' in cliente) {
					await cliente.focus();
					if ('navigate' in cliente) await cliente.navigate(destino).catch(() => {});
					return;
				}
			}
			await self.clients.openWindow(destino);
		})()
	);
});
