import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte';

/** Resultado de evaluar acceso: null = permitido, string = ruta de redirección. */
export function evaluarAcceso(requiere: 'auth' | 'admin' | 'superadmin'): string | null {
	if (!auth.user) return '/auth/login';
	// Mi Negocio es del dueño de comercio. El superadmin gestiona todos los comercios desde /admin
	// (si entrara acá vería "Creá tu comercio" y podría cargarse uno a su nombre).
	if (requiere === 'admin' && auth.isSuperAdmin) return '/admin';
	if (requiere === 'admin' && !auth.isAdmin) return '/';
	if (requiere === 'superadmin' && !auth.isSuperAdmin) return '/';
	return null;
}

/**
 * Guard centralizado para páginas cliente (la app es ssr=false y el JWT vive en
 * localStorage). Devuelve true si puede quedarse; si no, redirige y devuelve false.
 */
export function exigirAcceso(requiere: 'auth' | 'admin' | 'superadmin'): boolean {
	const destino = evaluarAcceso(requiere);
	if (destino) {
		goto(destino);
		return false;
	}
	return true;
}
