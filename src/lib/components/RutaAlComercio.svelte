<script lang="ts">
	import { browser } from '$app/environment';
	import Navigation from '@lucide/svelte/icons/navigation';
	import { calcularRuta, enlaceIndicaciones, resumenRuta, type RutaCalculada } from '$lib/ruta';

	let {
		destino,
		nombre,
		onruta
	}: {
		destino: [number, number];
		nombre?: string;
		onruta?: (ruta: RutaCalculada) => void;
	} = $props();

	let estado = $state<'inicial' | 'ubicando' | 'calculando' | 'lista' | 'error'>('inicial');
	let ruta = $state<RutaCalculada | null>(null);
	let error = $state('');

	const ocupado = $derived(estado === 'ubicando' || estado === 'calculando');

	function mensajeUbicacion(code: number): string {
		if (code === 1) return 'Necesitamos permiso para usar tu ubicación.';
		if (code === 3) return 'Tu ubicación tardó demasiado en responder.';
		return 'No pudimos obtener tu ubicación.';
	}

	async function comoLlegar() {
		if (!browser) return;
		if (!navigator.geolocation) {
			estado = 'error';
			error = 'Tu navegador no permite obtener la ubicación.';
			return;
		}
		error = '';
		ruta = null;
		estado = 'ubicando';
		try {
			const posicion = await new Promise<GeolocationPosition>((resolver, rechazar) => {
				navigator.geolocation.getCurrentPosition(
					resolver,
					(fallo) => rechazar(new Error(mensajeUbicacion(fallo.code))),
					{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
				);
			});
			estado = 'calculando';
			const calculada = await calcularRuta(
				[posicion.coords.latitude, posicion.coords.longitude],
				destino
			);
			ruta = calculada;
			estado = 'lista';
			onruta?.(calculada);
		} catch (fallo) {
			estado = 'error';
			error = fallo instanceof Error ? fallo.message : 'No pudimos calcular la ruta.';
		}
	}
</script>

<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
	<button
		type="button"
		onclick={comoLlegar}
		disabled={ocupado}
		aria-label={nombre ? `Cómo llegar a ${nombre}` : 'Cómo llegar'}
		class="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
	>
		<Navigation size={16} aria-hidden="true" />
		{#if estado === 'ubicando'}
			Ubicándote…
		{:else if estado === 'calculando'}
			Calculando ruta…
		{:else}
			Cómo llegar
		{/if}
	</button>
	{#if ruta}
		<p role="status" class="text-sm font-medium text-gray-600 dark:text-gray-300">
			{resumenRuta(ruta)}
		</p>
	{:else}
		<a
			href={enlaceIndicaciones(destino)}
			target="_blank"
			rel="noopener noreferrer"
			class="text-xs font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
		>
			o abrir en Google Maps
		</a>
	{/if}
</div>
{#if error}
	<p role="alert" class="mt-2 text-sm text-red-600 dark:text-red-400">
		{error}
		<a
			href={enlaceIndicaciones(destino)}
			target="_blank"
			rel="noopener noreferrer"
			class="font-semibold underline"
		>
			Abrir en Google Maps
		</a>
	</p>
{/if}
