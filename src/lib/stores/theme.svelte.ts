import { browser } from '$app/environment';
import {
	ACCENT_PRESETS,
	BRAND_STOPS,
	generarEscala,
	generarSecundario,
	type ThemeMode
} from '$lib/theme';

const STORAGE_KEY = 'tl360-theme';

interface StoredTheme {
	mode: ThemeMode;
	accent: string;
}

function loadStored(): StoredTheme {
	const fallback: StoredTheme = { mode: 'light', accent: ACCENT_PRESETS[0].hex };
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw);
		return {
			mode: parsed.mode === 'dark' ? 'dark' : 'light',
			accent: typeof parsed.accent === 'string' ? parsed.accent : fallback.accent
		};
	} catch {
		return fallback;
	}
}

class ThemeStore {
	mode = $state<ThemeMode>(loadStored().mode);
	accent = $state<string>(loadStored().accent);

	setMode(mode: ThemeMode) {
		this.mode = mode;
		this.persist();
		this.apply();
	}

	setAccent(hex: string) {
		this.accent = hex;
		this.persist();
		this.apply();
	}

	private persist() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: this.mode, accent: this.accent }));
	}

	/** Aplica el modo (claro/oscuro) y la escala de acento como variables CSS en :root. */
	apply() {
		if (!browser) return;
		document.documentElement.dataset.theme = this.mode;

		const escala = generarEscala(this.accent);
		const secundaria = generarSecundario(this.accent);
		const root = document.documentElement.style;
		for (const stop of BRAND_STOPS) {
			root.setProperty(`--color-brand-${stop}`, escala[stop]);
		}
		root.setProperty('--color-accent-500', secundaria[500]);
		root.setProperty('--color-accent-600', secundaria[600]);
	}
}

export const theme = new ThemeStore();
