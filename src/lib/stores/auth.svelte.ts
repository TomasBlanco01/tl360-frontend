import { browser } from '$app/environment';
import type { Usuario } from '$lib/types';

function loadStoredUser(): Usuario | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem('user');
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

class AuthStore {
	user = $state<Usuario | null>(loadStoredUser());
	token = $state<string | null>(browser ? localStorage.getItem('token') : null);

	isAdmin = $derived(this.user?.rol?.toLowerCase() === 'admin');
	isSuperAdmin = $derived(this.user?.rol?.toLowerCase() === 'superadmin');

	login(token: string, user: Usuario) {
		this.token = token;
		this.user = user;
		if (browser) {
			localStorage.setItem('token', token);
			localStorage.setItem('user', JSON.stringify(user));
		}
	}

	logout() {
		this.token = null;
		this.user = null;
		if (browser) {
			localStorage.removeItem('token');
			localStorage.removeItem('user');
		}
	}

	actualizar(datos: Partial<Usuario>) {
		if (!this.user) return;
		this.user = { ...this.user, ...datos };
		if (browser) {
			try {
				localStorage.setItem('user', JSON.stringify(this.user));
			} catch {
				// almacenamiento no disponible (SSR/tests)
			}
		}
	}
}

export const auth = new AuthStore();
