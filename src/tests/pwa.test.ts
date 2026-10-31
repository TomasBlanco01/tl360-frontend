import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf8');

describe('PWA base (RNF-04)', () => {
	it('el manifest declara la app instalable con sus iconos', () => {
		const manifest = JSON.parse(leer('static/manifest.webmanifest')) as {
			name: string;
			short_name: string;
			start_url: string;
			display: string;
			theme_color: string;
			icons: { src: string; sizes: string; purpose?: string }[];
		};

		expect(manifest.name).toContain('TL360');
		expect(manifest.short_name).toBe('TL360');
		expect(manifest.start_url).toBe('/');
		expect(manifest.display).toBe('standalone');
		expect(manifest.theme_color).toBe('#5e35b1');
		expect(manifest.icons).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
				expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512' }),
				expect.objectContaining({ sizes: '512x512', purpose: 'maskable' })
			])
		);
		for (const icono of manifest.icons) {
			expect(existsSync(resolve(raiz, `static${icono.src}`))).toBe(true);
		}
	});

	it('app.html enlaza el manifest y el theme-color', () => {
		const html = leer('src/app.html');
		expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
		expect(html).toContain('<meta name="theme-color" content="#5e35b1" />');
		expect(html).toContain('<html lang="es">');
	});

	it('el service worker precachea el build y cae a la página offline', () => {
		const sw = leer('src/service-worker.js');
		expect(sw).toContain("from '$service-worker'");
		expect(sw).toContain('cache.addAll(PRECACHE)');
		expect(sw).toContain("const OFFLINE = '/offline.html'");
		expect(sw).toContain("request.mode === 'navigate'");
		expect(existsSync(resolve(raiz, 'static/offline.html'))).toBe(true);
		expect(leer('static/offline.html')).toContain('Estás sin conexión');
	});

	it('el service worker muestra las notificaciones push y abre su destino', () => {
		const sw = leer('src/service-worker.js');
		expect(sw).toContain("addEventListener('push'");
		expect(sw).toContain('self.registration.showNotification');
		expect(sw).toContain("addEventListener('notificationclick'");
		expect(sw).toContain('self.clients.openWindow');
		expect(sw).toContain("datos.url ?? '/'");
	});
});
