<script lang="ts">
	import { page } from '$app/state';

	// P2-10 Esta ruta es solo un alias: el load de +page.ts ya redirige a
	// /comercios?vista=mapa. Este markup es el fallback (sin JS o durante
	// la redirección en cliente) y no duplica filtros ni mapa.
	const destino = $derived.by(() => {
		const params = new URLSearchParams();
		params.set('vista', 'mapa');
		const q = page.url.searchParams.get('q');
		if (q) params.set('q', q);
		const categoria =
			page.url.searchParams.get('categoria') ?? page.url.searchParams.get('categoria_id');
		if (categoria) params.set('categoria', categoria);
		const etiquetas = page.url.searchParams.get('etiquetas');
		if (etiquetas) params.set('etiquetas', etiquetas);
		return `/comercios?${params.toString()}`;
	});
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Mapa de comercios</h1>
	<p class="mb-5 text-gray-500 dark:text-gray-400">
		Mudamos esta vista al directorio unificado. Si no te redirigimos solos,
		<a href={destino} class="font-medium text-brand-600 hover:underline dark:text-brand-400">
			abrí Comercios → Mapa
		</a>.
	</p>
</div>
