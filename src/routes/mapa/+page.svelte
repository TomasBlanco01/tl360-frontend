<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import { distanciaKm, formatearDistancia } from '$lib/geo';
	import { urlEmpresa } from '$lib/slug';
	import type { Categoria, PuntoMapa } from '$lib/types';
	import MapaComercios from '$lib/components/MapaComercios.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	// 2.1 El directorio unificado vive en /comercios?vista=mapa. Esta ruta vieja redirige
	// conservando el filtro de rubro, para no romper enlaces guardados ni el test de /mapa.
	const redirigir = page.url.searchParams.toString();
	$effect(() => {
		goto(`/comercios?vista=mapa${redirigir ? `&${redirigir}` : ''}`, { replaceState: true });
	});

	let categorias = $state<Categoria[]>([]);
	let puntos = $state<PuntoMapa[]>([]);
	let categoriaId = $state(page.url.searchParams.get('categoria_id') ?? '');
	let cargando = $state(true);
	let error = $state('');

	let yo = $state<[number, number] | null>(null);
	let buscandoUbicacion = $state(false);
	let errorUbicacion = $state('');

	$effect(() => {
		api
			.get<Categoria[]>('/categorias')
			.then((res) => (categorias = res))
			.catch((err) => console.error(err));
	});

	$effect(() => {
		const cat = categoriaId;
		cargando = true;
		error = '';
		api
			.get<PuntoMapa[]>(`/empresas/mapa${cat ? `?categoria_id=${cat}` : ''}`)
			.then((res) => (puntos = res))
			.catch((err) => {
				console.error(err);
				error = 'No se pudo cargar el mapa.';
			})
			.finally(() => (cargando = false));
	});

	// Con la ubicación del usuario, se listan los más cercanos (RF-02).
	const cercanos = $derived(
		yo
			? puntos
					.map((p) => ({ ...p, km: distanciaKm(yo!, [p.lat, p.lng]) }))
					.sort((a, b) => a.km - b.km)
					.slice(0, 12)
			: []
	);

	function usarMiUbicacion() {
		errorUbicacion = '';
		if (!('geolocation' in navigator)) {
			errorUbicacion = 'Tu navegador no permite obtener la ubicación.';
			return;
		}
		buscandoUbicacion = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				yo = [pos.coords.latitude, pos.coords.longitude];
				buscandoUbicacion = false;
			},
			() => {
				errorUbicacion = 'No pudimos obtener tu ubicación. Revisá el permiso del navegador.';
				buscandoUbicacion = false;
			},
			{ enableHighAccuracy: false, timeout: 10000 }
		);
	}
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Mapa de comercios</h1>
	<p class="mb-5 text-gray-500 dark:text-gray-400">
		Encontrá comercios por zona. Tocá un punto para ver su ficha. Estamos mudando esta vista a
		<a
			href="/comercios?vista=mapa"
			class="font-medium text-brand-600 hover:underline dark:text-brand-400">Comercios → Mapa</a
		>.
	</p>

	<div class="mb-4 flex flex-wrap items-center gap-3">
		<select
			bind:value={categoriaId}
			aria-label="Rubro"
			class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		>
			<option value="">Todos los rubros</option>
			{#each categorias as c (c.id)}
				<option value={String(c.id)}>{c.nombre}</option>
			{/each}
		</select>
		<Button variant="outline" disabled={buscandoUbicacion} onclick={usarMiUbicacion}>
			{buscandoUbicacion ? 'Buscando…' : 'Cerca de mí'}
		</Button>
		{#if !cargando && !error}
			<span class="text-sm text-gray-400 dark:text-gray-500"
				>{puntos.length} {puntos.length === 1 ? 'comercio' : 'comercios'} en el mapa</span
			>
		{/if}
	</div>

	{#if errorUbicacion}
		<p class="mb-3 text-sm text-danger-600">{errorUbicacion}</p>
	{/if}

	{#if error}
		<EmptyState title="Error" description={error} />
	{:else}
		<Card class="p-2">
			<MapaComercios
				{puntos}
				{yo}
				alto="h-[28rem]"
				onseleccionar={(id) => {
					const p = puntos.find((x) => x.id === id);
					goto(
						p && 'slug' in p && p.slug
							? `/comercios/${(p as unknown as { slug: string }).slug}`
							: `/comercios/${id}`
					);
				}}
			/>
		</Card>
		{#if !cargando && puntos.length === 0}
			<p class="mt-3 text-sm text-gray-400 dark:text-gray-500">
				Todavía no hay comercios geolocalizados en este rubro.
			</p>
		{/if}
	{/if}

	{#if buscandoUbicacion}
		<p class="mt-4 text-sm text-gray-400 dark:text-gray-500" role="status">
			Calculando distancias…
		</p>
	{:else if cercanos.length > 0}
		<h2 class="mt-6 mb-2 text-lg font-semibold text-gray-800 dark:text-gray-100">
			Los más cercanos
		</h2>
		<ul class="flex flex-col gap-2">
			{#each cercanos as c (c.id)}
				<li>
					<a href={urlEmpresa(c as unknown as { id: number; slug?: string })}>
						<Card hoverable class="flex items-center justify-between gap-3 p-3">
							<span class="font-medium text-gray-800 dark:text-gray-100">{c.nombre}</span>
							<span class="text-sm text-gray-500 dark:text-gray-400"
								>{formatearDistancia(c.km)}</span
							>
						</Card>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
