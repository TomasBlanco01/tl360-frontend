<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { navigating } from '$app/state';
	import NavBar from '$lib/components/NavBar.svelte';
	import Toaster from '$lib/_auditoria/Toaster.svelte';
	import { theme } from '$lib/stores/theme.svelte';

	let { children } = $props();

	theme.apply();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>TL360 — Comercios de Trenque Lauquen</title>
	<meta
		name="description"
		content="Directorio de comercios y servicios de Trenque Lauquen: reservá turnos online y contactá directo por llamada o WhatsApp."
	/>
	<meta property="og:site_name" content="TL360" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="es_AR" />
</svelte:head>

<a
	href="#contenido"
	class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[70] focus:rounded-full focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
>
	Saltar al contenido
</a>

<div
	class="min-h-screen bg-white text-gray-800 transition-colors duration-300 dark:bg-gray-950 dark:text-gray-100"
>
	<NavBar />
	{#if navigating}
		<p role="status" class="mx-auto max-w-6xl px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
			Cargando...
		</p>
	{/if}
	<main id="contenido">
		{@render children()}
	</main>
	<Toaster />
</div>
