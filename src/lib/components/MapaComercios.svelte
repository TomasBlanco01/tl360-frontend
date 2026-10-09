<script lang="ts">
	import { browser } from '$app/environment';
	import 'leaflet/dist/leaflet.css';
	import type { Map as LeafletMap, LayerGroup, Marker } from 'leaflet';
	import type { PuntoMapa } from '$lib/types';
	import { agruparPuntos, escaparHtml } from '$lib/geo';

	let {
		puntos,
		centro = [-35.9711, -62.7333],
		zoom = 14,
		yo = null,
		alto = 'h-72',
		onseleccionar,
		modoSelector = false,
		latitud = null,
		longitud = null,
		oncambio,
		cargandoDatos = false
	}: {
		puntos: PuntoMapa[];
		centro?: [number, number];
		zoom?: number;
		/** Posición del usuario (geolocalización), si la concedió. */
		yo?: [number, number] | null;
		alto?: string;
		onseleccionar?: (id: number) => void;
		modoSelector?: boolean;
		latitud?: number | null;
		longitud?: number | null;
		oncambio?: (lat: number, lng: number) => void;
		/** La lista de puntos sigue cargando (overlay de datos, distinto de "Cargando mapa"). */
		cargandoDatos?: boolean;
	} = $props();

	let contenedor: HTMLDivElement | undefined = $state();
	let mapa: LeafletMap | undefined;
	let capa: LayerGroup | undefined;
	let pinSelector: Marker | undefined;
	let L: typeof import('leaflet') | undefined;
	let listo = $state(false);

	// Leaflet toca `window` al importarse: se carga solo en el navegador (evita "window is not defined" en SSR).
	$effect(() => {
		if (!browser || !contenedor) return;
		let cancelado = false;
		import('leaflet').then((mod) => {
			if (cancelado || !contenedor) return;
			L = mod.default ?? mod;
			// 2.3 Zoom con rueda habilitado para desktop; en mobile el gesto de 1 dedo sigue libre.
			mapa = L.map(contenedor, { scrollWheelZoom: true }).setView(centro, zoom);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution:
					'&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
			}).addTo(mapa);
			capa = L.layerGroup().addTo(mapa);
			if (modoSelector && mapa && L) {
				mapa.on('click', (e: { latlng: { lat: number; lng: number } }) => {
					oncambio?.(e.latlng.lat, e.latlng.lng);
				});
			}
			listo = true;
		});
		return () => {
			cancelado = true;
			mapa?.remove();
			mapa = undefined;
			pinSelector = undefined;
			listo = false;
		};
	});

	$effect(() => {
		if (!listo || !L || !mapa || !capa) return;
		const zoomActual = mapa.getZoom?.() ?? zoom;
		const grupos = agruparPuntos(puntos, zoomActual);
		const marcadores = grupos.flatMap((g) => {
			if (g.items.length > 1) {
				const m = L!
					.circleMarker([g.lat, g.lng], {
						radius: 12,
						weight: 2,
						color: '#fff',
						fillColor: '#7e57c2',
						fillOpacity: 0.95
					})
					.bindTooltip(`${g.items.length} comercios`);
				m.on('click', () => {
					mapa?.setView([g.lat, g.lng], Math.min((mapa?.getZoom?.() ?? zoom) + 2, 17));
				});
				return [m];
			}
			const p = g.items[0];
			const url = `/comercios/${p.slug || p.id}`;
			const popup = `<div style="min-width:160px"><strong>${escaparHtml(p.nombre)}</strong>${p.verificado ? ' ✓' : ''}<br><a href="${url}">Ver ficha →</a></div>`;
			const m = L!
				.circleMarker([p.lat, p.lng], {
					radius: 7,
					weight: 2,
					color: '#fff',
					fillColor: '#4f46e5',
					fillOpacity: 0.9
				})
				.bindTooltip(p.nombre)
				.bindPopup(popup);
			if (onseleccionar) m.on('click', () => onseleccionar(p.id));
			return [m];
		});
		capa.clearLayers();
		if (pinSelector) {
			pinSelector.remove();
			pinSelector = undefined;
		}
		marcadores.forEach((m) => capa!.addLayer(m));
		if (yo) {
			L.circleMarker(yo, {
				radius: 8,
				weight: 3,
				color: '#fff',
				fillColor: '#16a34a',
				fillOpacity: 1
			})
				.bindTooltip('Estás acá')
				.addTo(capa);
		}
		// 1.3 Pin del dueño: arrastrable + se reubica al hacer clic en el mapa.
		if (modoSelector && latitud != null && longitud != null) {
			pinSelector = L.marker([latitud, longitud], { draggable: true })
				.bindTooltip('Tu local (arrastrame)')
				.addTo(mapa);
			pinSelector.on('dragend', () => {
				const pos = pinSelector!.getLatLng();
				oncambio?.(pos.lat, pos.lng);
			});
		}
		const todos: [number, number][] = [
			...puntos.map((p) => [p.lat, p.lng] as [number, number]),
			...(yo ? [yo] : []),
			...(modoSelector && latitud != null && longitud != null
				? [[latitud, longitud] as [number, number]]
				: [])
		];
		if (todos.length > 1) mapa.fitBounds(todos, { padding: [30, 30], maxZoom: 16 });
		else if (todos.length === 1) mapa.setView(todos[0], 16);
	});

	const googleMapsUrl = $derived(
		modoSelector && latitud != null && longitud != null
			? `https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`
			: puntos.length === 1
				? `https://www.google.com/maps/search/?api=1&query=${puntos[0].lat},${puntos[0].lng}`
				: null
	);
</script>

<!-- 2.3 Aislar el stacking de Leaflet (panes z 400/1000) para que no tape navbar ni lightbox. -->
<div class="relative isolate z-0 overflow-hidden rounded-lg">
	<div bind:this={contenedor} class="{alto} w-full overflow-hidden" data-testid="mapa"></div>
	{#if !listo}
		<div
			class="absolute inset-0 flex items-center justify-center bg-gray-50 text-sm text-gray-400 dark:bg-gray-900 dark:text-gray-500"
			role="status"
			aria-label="Cargando mapa"
		>
			<span class="animate-pulse">Cargando mapa…</span>
		</div>
	{:else if cargandoDatos}
		<div
			class="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
			role="status"
			aria-label="Cargando comercios del mapa"
		>
			<span
				class="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-gray-500 shadow dark:bg-gray-800/95 dark:text-gray-300"
				>Actualizando comercios…</span
			>
		</div>
	{/if}
	{#if googleMapsUrl}
		<a
			href={googleMapsUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="absolute right-2 bottom-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-md transition hover:bg-white dark:bg-gray-800/95 dark:text-gray-200"
		>
			Abrir en Google Maps ↗
		</a>
	{/if}
</div>
