import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * P2-10 `/mapa` es un alias viejo: redirige a `/comercios?vista=mapa`
 * a nivel de load (servidor y cliente), sin duplicar la lógica de
 * filtros/mapa que ya vive en el directorio unificado.
 */
export const load: PageLoad = ({ url }) => {
	const params = new URLSearchParams();
	params.set('vista', 'mapa');
	const q = url.searchParams.get('q');
	if (q) params.set('q', q);
	// El directorio usa `?categoria=`; esta ruta vieja usaba `?categoria_id=`.
	const categoria = url.searchParams.get('categoria') ?? url.searchParams.get('categoria_id');
	if (categoria) params.set('categoria', categoria);
	const etiquetas = url.searchParams.get('etiquetas');
	if (etiquetas) params.set('etiquetas', etiquetas);
	throw redirect(308, `/comercios?${params.toString()}`);
};
