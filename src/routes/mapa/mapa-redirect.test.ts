import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { load } from './+page';
import Mapa from './+page.svelte';

function url(path: string) {
	return new URL(path, 'https://tl360.local');
}

describe('redirect /mapa → /comercios?vista=mapa', () => {
	it('redirige 308 conservando q y traduciendo categoria_id → categoria', () => {
		let destino = '';
		try {
			load({ url: url('/mapa?q=cafe&categoria_id=2&etiquetas=rampa') } as never, {} as never);
		} catch (e) {
			// SvelteKit representa el redirect como objeto con location/status.
			destino = (e as { location: string }).location ?? String(e);
		}
		expect(destino).toContain('/comercios?');
		expect(destino).toContain('vista=mapa');
		expect(destino).toContain('q=cafe');
		expect(destino).toContain('categoria=2');
		expect(destino).toContain('etiquetas=rampa');
	});

	it('sin filtros redirige solo con vista=mapa', () => {
		let destino = '';
		try {
			load({ url: url('/mapa') } as never, {} as never);
		} catch (e) {
			destino = (e as { location: string }).location ?? String(e);
		}
		expect(destino).toBe('/comercios?vista=mapa');
	});

	it('el fallback muestra enlace al directorio unificado', () => {
		render(Mapa);
		const enlace = screen.getByRole('link', { name: /Comercios → Mapa/ });
		expect(enlace.getAttribute('href')).toContain('/comercios?vista=mapa');
	});
});
