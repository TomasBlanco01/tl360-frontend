<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { navigating } from '$app/state';
	import NavBar from '$lib/components/NavBar.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { theme } from '$lib/stores/theme.svelte';

	let { children } = $props();

	theme.apply();

	let lenta = $state(false);
	$effect(() => {
		if (!navigating.to) {
			lenta = false;
			return;
		}
		const t = setTimeout(() => (lenta = true), 250);
		return () => clearTimeout(t);
	});
</script>

<style>
	.barra-carga {
		animation: barra-carga 1.1s ease-in-out infinite;
	}
	@keyframes barra-carga {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.barra-carga {
			animation: none;
			width: 100%;
		}
	}
</style>

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
	<!-- `navigating` de $app/state siempre es un objeto: se navega solo cuando tiene destino.
	     Barra fina fija arriba (no empuja el contenido) y solo si la navegación tarda: las
	     navegaciones rápidas no muestran nada. -->
	{#if lenta}
		<div
			role="progressbar"
			aria-label="Cargando la página"
			class="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-brand-100 dark:bg-gray-800"
		>
			<div class="barra-carga h-full w-1/3 bg-brand-500"></div>
		</div>
	{/if}
	<main id="contenido">
		{@render children()}
	</main>
	<Toaster />
</div>
