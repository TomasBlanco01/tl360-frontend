export type ThemeMode = 'light' | 'dark';

export interface AccentPreset {
	id: string;
	label: string;
	hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
	{ id: 'violeta', label: 'Violeta', hex: '#7e57c2' },
	{ id: 'teal', label: 'Teal', hex: '#009688' },
	{ id: 'coral', label: 'Coral', hex: '#f4645f' },
	{ id: 'azul', label: 'Azul', hex: '#3b82f6' },
	{ id: 'verde', label: 'Verde', hex: '#10b981' },
	{ id: 'ambar', label: 'Ámbar', hex: '#f59e0b' }
];

export const BRAND_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 900] as const;
export type BrandStop = (typeof BRAND_STOPS)[number];

function clamp01(n: number): number {
	return Math.min(1, Math.max(0, n));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
	const clean = hex.replace('#', '');
	const bigint = parseInt(
		clean.length === 3
			? clean
					.split('')
					.map((c) => c + c)
					.join('')
			: clean,
		16
	);
	const r = ((bigint >> 16) & 255) / 255;
	const g = ((bigint >> 8) & 255) / 255;
	const b = (bigint & 255) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;

	if (max === min) return { h: 0, s: 0, l };

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	switch (max) {
		case r:
			h = (g - b) / d + (g < b ? 6 : 0);
			break;
		case g:
			h = (b - r) / d + 2;
			break;
		default:
			h = (r - g) / d + 4;
	}
	return { h: h * 60, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
	const hue = ((h % 360) + 360) % 360;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + hue / 30) % 12;
		const color = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
		return Math.round(255 * clamp01(color))
			.toString(16)
			.padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

const LIGHTEN_TOWARD_WHITE: Partial<Record<BrandStop, number>> = {
	50: 0.9,
	100: 0.78,
	200: 0.6,
	300: 0.4,
	400: 0.2
};
const DARKEN_TOWARD_BLACK: Partial<Record<BrandStop, number>> = {
	600: 0.18,
	700: 0.38,
	900: 0.72
};

/** Genera una escala de 50 a 900 a partir de un color base, manteniendo el hue/saturación. */
export function generarEscala(hexBase: string): Record<BrandStop, string> {
	const { h, s, l } = hexToHsl(hexBase);
	const result = {} as Record<BrandStop, string>;
	for (const stop of BRAND_STOPS) {
		if (stop === 500) {
			result[stop] = hslToHex(h, s, l);
		} else if (stop in LIGHTEN_TOWARD_WHITE) {
			const t = LIGHTEN_TOWARD_WHITE[stop]!;
			result[stop] = hslToHex(h, s, clamp01(l + (1 - l) * t));
		} else {
			const t = DARKEN_TOWARD_BLACK[stop]!;
			result[stop] = hslToHex(h, s, clamp01(l * (1 - t)));
		}
	}
	return result;
}

/** Color secundario ("accent") derivado del acento principal rotando el hue. */
export function generarSecundario(hexBase: string): Record<BrandStop, string> {
	const { h, s, l } = hexToHsl(hexBase);
	return generarEscala(hslToHex((h + 140) % 360, s, l));
}
