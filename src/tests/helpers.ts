import { createRawSnippet } from 'svelte';
import { vi } from 'vitest';
import { page } from '$app/state';
import type { Empresa } from '$lib/types';

/** Snippet de texto para pasar como `children` a componentes que lo exigen. */
export const texto = (contenido: string) =>
	createRawSnippet(() => ({ render: () => `<span>${contenido}</span>` }));

/** Fija la URL que ven las páginas a través de `$app/state`. */
export function setUrl(url: string) {
	(page as { url: URL }).url = new URL(url, 'http://localhost');
}

/** Vuelve a importar un módulo con otro valor de PUBLIC_MOCK_MODE (los módulos lo leen al cargarse). */
export async function conModoMock<T>(
	modo: 'true' | 'false',
	importar: () => Promise<T>
): Promise<T> {
	vi.resetModules();
	vi.doMock('$env/static/public', () => ({
		PUBLIC_API_URL: 'http://api.test',
		PUBLIC_MOCK_MODE: modo
	}));
	return importar();
}

export function empresa(parcial: Partial<Empresa> = {}): Empresa {
	return {
		id: 1,
		nombre: 'Peluquería Central',
		direccion: 'Calle 123',
		telefono: '2392111111',
		slogan: 'Cortes y color',
		categoria_id: 1,
		categoria: 'Peluquerías',
		admin_id: null,
		...parcial
	};
}

/** Respuesta `fetch` mínima con cuerpo JSON. */
export function respuesta(status: number, cuerpo?: unknown): Response {
	return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
