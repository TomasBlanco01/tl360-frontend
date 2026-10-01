import { browser } from '$app/environment';
import { PUBLIC_MOCK_MODE } from '$env/static/public';
import { api } from '$lib/api';
import { auth } from './auth.svelte';

const MOCK = PUBLIC_MOCK_MODE === 'true';

// Favoritos por usuario, persistidos en localStorage (no hay endpoint de backend para esto todavía).
function storageKey(): string | null {
	if (!auth.user) return null;
	return `favoritos:${auth.user.id}`;
}

function load(): number[] {
	const key = storageKey();
	if (!browser || !key) return [];
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

class FavoritosStore {
	ids = $state<number[]>(MOCK ? load() : []);

	sync() {
		if (MOCK) {
			this.ids = load();
			return;
		}
		if (!auth.user) {
			this.ids = [];
			return;
		}
		api
			.get<number[]>('/favoritos')
			.then((ids) => (this.ids = ids))
			.catch((err) => console.error('Error al obtener favoritos:', err));
	}

	isFavorito(empresaId: number) {
		return this.ids.includes(empresaId);
	}

	toggle(empresaId: number) {
		if (!auth.user) return;
		const era = this.ids.includes(empresaId);
		this.ids = era ? this.ids.filter((id) => id !== empresaId) : [...this.ids, empresaId];

		if (MOCK) {
			const key = storageKey();
			if (browser && key) localStorage.setItem(key, JSON.stringify(this.ids));
			return;
		}
		const req = era ? api.delete(`/favoritos/${empresaId}`) : api.put(`/favoritos/${empresaId}`);
		req.catch(() => this.sync());
	}
}

export const favoritos = new FavoritosStore();
