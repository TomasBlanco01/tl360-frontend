<script lang="ts">
	import { browser } from '$app/environment';
	import 'leaflet/dist/leaflet.css';
	import type { Map as LeafletMap, LayerGroup } from 'leaflet';
	import type { PuntoMapa } from '$lib/types';

	let {
		puntos,
		centro = [-35.9711, -62.7333],
		zoom = 14,
		yo = null,
		alto = 'h-72',
		onseleccionar
	}: {
		puntos: PuntoMapa[];
		centro?: [number, number];
		zoom?: number;
		/** Posición del usuario (geolocalización), si la concedió. */
		yo?: [number, number] | null;
		alto?: string;
		onseleccionar?: (id: number) => void;
	} = $props();

	let contenedor: HTMLDivElement | undefined = $state();
	let mapa: LeafletMap | undefined;
	let capa: LayerGroup | undefined;
	let L: typeof import('leaflet') | undefined;
	let listo = $state(false);

	// Leaflet toca `window` al importarse: se carga solo en el navegador (evita "window is not defined" en SSR).
	$effect(() => {
		if (!browser || !contenedor) return;
		let cancelado = false;
		import('leaflet').then((mod) => {
			if (cancelado || !contenedor) return;
			L = mod.default ?? mod;
			mapa = L.map(contenedor, { scrollWheelZoom: false }).setView(centro, zoom);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution:
					'&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
			}).addTo(mapa);
			capa = L.layerGroup().addTo(mapa);
			listo = true;
		});
		return () => {
			cancelado = true;
			mapa?.remove();
			mapa = undefined;
			listo = false;
		};
	});

	$effect(() => {
		if (!listo || !L || !mapa || !capa) return;
		const marcadores = puntos.map((p) => {
			const m = L!
				.circleMarker([p.lat, p.lng], {
					radius: 7,
					weight: 2,
					color: '#fff',
					fillColor: '#4f46e5',
					fillOpacity: 0.9
				})
				.bindTooltip(p.nombre);
			if (onseleccionar) m.on('click', () => onseleccionar(p.id));
			return m;
		});
		capa.clearLayers();
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
		const todos: [number, number][] = [
			...puntos.map((p) => [p.lat, p.lng] as [number, number]),
			...(yo ? [yo] : [])
		];
		if (todos.length > 1) mapa.fitBounds(todos, { padding: [30, 30], maxZoom: 16 });
		else if (todos.length === 1) mapa.setView(todos[0], 16);
	});
</script>

<div
	bind:this={contenedor}
	class="{alto} w-full overflow-hidden rounded-lg"
	data-testid="mapa"
></div>
