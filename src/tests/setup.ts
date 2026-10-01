import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Los tests no dependen del .env del desarrollador: el modo mock se activa por test (ver helpers.ts).
vi.mock('$env/static/public', () => ({
	PUBLIC_API_URL: 'http://api.test',
	PUBLIC_MOCK_MODE: 'false'
}));

vi.mock('$app/environment', () => ({
	browser: true,
	dev: false,
	building: false,
	version: 'test'
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidateAll: vi.fn(),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn()
}));

// `page` es un objeto mutable: cada test fija la URL con `setUrl()` de helpers.ts.
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/'), params: {}, data: {} }
}));

// jsdom no implementa la Web Animations API que usan las transiciones de Svelte (`transition:fly`):
// se simula una animación que termina enseguida, para que las páginas se puedan montar en los tests.
if (!Element.prototype.animate) {
	Element.prototype.animate = function () {
		const animacion: Record<string, unknown> = {
			currentTime: 0,
			finished: Promise.resolve(),
			onfinish: null,
			cancel() {},
			pause() {},
			play() {},
			reverse() {},
			finish() {
				(animacion.onfinish as (() => void) | null)?.();
			}
		};
		queueMicrotask(() => (animacion.onfinish as (() => void) | null)?.());
		return animacion as unknown as Animation;
	};
}

afterEach(() => {
	cleanup();
	localStorage.clear();
});
