<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import type { Map as LeafletMap, LayerGroup, Marker } from 'leaflet';
	import type { PuntoMapa } from '$lib/types';
	import { agruparEnPantalla, dentroDeLimites, escaparHtml, type Limites } from '$lib/geo';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';

	let {
		puntos,
		centro = [-35.9711, -62.7333],
		zoom = 14,
		yo = null,
		alto = 'h-72',
		onseleccionar,
		onvisibles,
		modoSelector = false,
		latitud = null,
		longitud = null,
		oncambio,
		cargandoDatos = false,
		ruta = null
	}: {
		puntos: PuntoMapa[];
		centro?: [number, number];
		zoom?: number;
		/** Posición del usuario (geolocalización), si la concedió. */
		yo?: [number, number] | null;
		/** Trazado [lat, lng] devuelto por OSRM (RF-02). */
		ruta?: [number, number][] | null;
		alto?: string;
		onseleccionar?: (id: number) => void;
		/** Ids de los puntos que quedan a la vista tras mover o hacer zoom (el listado los sigue). */
		onvisibles?: (ids: number[]) => void;
		modoSelector?: boolean;
		latitud?: number | null;
		longitud?: number | null;
		oncambio?: (lat: number, lng: number) => void;
		/** La lista de puntos sigue cargando (overlay de datos, distinto de "Cargando mapa"). */
		cargandoDatos?: boolean;
	} = $props();

	/** A partir de este zoom cada comercio se dibuja en su ubicación real, sin agrupar. */
	const ZOOM_SIN_AGRUPAR = 17;

	let contenedor: HTMLDivElement | undefined = $state();
	let mapa: LeafletMap | undefined;
	let capa: LayerGroup | undefined;
	let pinSelector: Marker | undefined;
	let L: typeof import('leaflet') | undefined;
	let listo = $state(false);
	// Cambia con cada zoom o desplazamiento: vuelve a agrupar y a informar los visibles.
	let vista = $state(0);

	// RF-10: el corazón del popup usa el mismo store que la ficha del comercio.
	function alternarFavoritoDesdeMapa(id: number) {
		if (!auth.user) {
			goto('/auth/login');
			return;
		}
		favoritos.toggle(id);
	}

	function alClickEnMapa(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		const boton = target?.closest<HTMLElement>('[data-favorito-id]');
		if (!boton) return;
		const id = Number(boton.dataset.favoritoId);
		if (Number.isInteger(id)) alternarFavoritoDesdeMapa(id);
	}

	$effect(() => {
		if (!browser || !contenedor) return;
		const el = contenedor;
		el.addEventListener('click', alClickEnMapa);
		return () => el.removeEventListener('click', alClickEnMapa);
	});

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
			if (modoSelector) {
				mapa.on('click', (e: { latlng: { lat: number; lng: number } }) => {
					oncambio?.(e.latlng.lat, e.latlng.lng);
				});
			}
			mapa.on('moveend', () => vista++);
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

	function limitesActuales(): Limites | null {
		const b = mapa?.getBounds?.();
		if (!b) return null;
		return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
	}

	// Encuadre: solo cuando cambia el conjunto de puntos (filtros nuevos), la ruta o la ubicación.
	// No en cada zoom: si no, el mapa "saltaría" de vuelta cada vez que el usuario se acerca.
	const claveEncuadre = $derived(
		JSON.stringify([
			puntos.map((p) => p.id),
			yo,
			ruta?.length ?? 0,
			modoSelector ? [latitud, longitud] : null
		])
	);
	$effect(() => {
		void claveEncuadre;
		if (!listo || !mapa) return;
		untrack(() => {
			const todos: [number, number][] = [
				...puntos.map((p) => [p.lat, p.lng] as [number, number]),
				...(yo ? [yo] : []),
				...(ruta ?? []),
				...(modoSelector && latitud != null && longitud != null
					? [[latitud, longitud] as [number, number]]
					: [])
			];
			if (todos.length > 1) mapa!.fitBounds(todos, { padding: [30, 30], maxZoom: 16 });
			else if (todos.length === 1) mapa!.setView(todos[0], 16);
			vista++;
		});
	});

	// Marcadores: se reagrupan en cada zoom/desplazamiento (`vista`) según la distancia en pantalla.
	$effect(() => {
		void vista;
		if (!listo || !L || !mapa || !capa) return;
		const Lf = L;
		const m = mapa;
		const zoomActual = m.getZoom?.() ?? zoom;
		const grupos = agruparEnPantalla(
			puntos,
			(lat, lng) => m.project([lat, lng], zoomActual),
			zoomActual >= ZOOM_SIN_AGRUPAR ? 0 : 56
		);
		function marcadorDe(p: PuntoMapa, pos: [number, number]) {
			const url = `/comercios/${p.slug || p.id}`;
			const favorito = favoritos.isFavorito(p.id);
			const corazon = favorito ? '♥' : '♡';
			const etiqueta = favorito ? 'Quitar de favoritos' : 'Marcar como favorito';
			// RF-10: el corazón solo para visitantes y clientes; el dueño o el superadmin no usan favoritos.
			const boton =
				!auth.user || auth.user.rol === 'cliente'
					? ` <button type="button" data-favorito-id="${p.id}" aria-label="${etiqueta}" style="border:0;background:transparent;cursor:pointer;font-size:1.1rem;line-height:1;color:${favorito ? '#dc2626' : '#9ca3af'}">${corazon}</button>`
					: '';
			const popup = `<div style="min-width:160px"><strong>${escaparHtml(p.nombre)}</strong>${p.verificado ? ' ✔' : ''}<br><a href="${url}">Ver ficha</a>${boton}</div>`;
			const marcador = Lf.circleMarker(pos, {
				radius: 8,
				weight: 2,
				color: '#fff',
				fillColor: '#4f46e5',
				fillOpacity: 0.9
			})
				.bindTooltip(p.nombre)
				.bindPopup(popup);
			if (onseleccionar) marcador.on('click', () => onseleccionar(p.id));
			return marcador;
		}
		const marcadores = grupos.map((g) => {
			// Zoom máximo y aun así juntos: comparten la misma dirección. Se abren en abanico alrededor
			// del punto real (unidos por una línea) para poder tocar cada uno.
			if (g.items.length > 1 && zoomActual >= ZOOM_SIN_AGRUPAR) {
				const centroPx = m.project([g.lat, g.lng], zoomActual);
				const radio = 18 + g.items.length * 2;
				return Lf.layerGroup(
					g.items.flatMap((p, i) => {
						const angulo = (2 * Math.PI * i) / g.items.length - Math.PI / 2;
						const pos = m.unproject(
							[centroPx.x + radio * Math.cos(angulo), centroPx.y + radio * Math.sin(angulo)],
							zoomActual
						);
						return [
							Lf.polyline([[g.lat, g.lng], pos], { color: '#7e57c2', weight: 1, opacity: 0.7 }),
							marcadorDe(p, [pos.lat, pos.lng])
						];
					})
				);
			}
			if (g.items.length > 1) {
				const n = g.items.length;
				const lado = n >= 100 ? 46 : n >= 10 ? 40 : 34;
				const icono = Lf.divIcon({
					className: '',
					html: `<div style="width:${lado}px;height:${lado}px;border-radius:9999px;background:#7e57c2;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:600 13px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center">${n}</div>`,
					iconSize: [lado, lado],
					iconAnchor: [lado / 2, lado / 2]
				});
				const marcador = Lf.marker([g.lat, g.lng], { icon: icono, keyboard: true }).bindTooltip(
					`${n} comercios: acercate para verlos`
				);
				marcador.on('click', () => {
					const limites = Lf.latLngBounds(g.items.map((p) => [p.lat, p.lng] as [number, number]));
					m.fitBounds(limites, { padding: [40, 40], maxZoom: ZOOM_SIN_AGRUPAR + 1 });
				});
				return marcador;
			}
			return marcadorDe(g.items[0], [g.items[0].lat, g.items[0].lng]);
		});
		capa.clearLayers();
		if (pinSelector) {
			pinSelector.remove();
			pinSelector = undefined;
		}
		// RF-02: dibujar la ruta debajo de los marcadores.
		if (ruta && ruta.length > 1) {
			Lf.polyline(ruta, { color: '#5e35b1', weight: 5, opacity: 0.85 }).addTo(capa);
		}
		marcadores.forEach((mk) => capa!.addLayer(mk));
		if (yo) {
			Lf.circleMarker(yo, {
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
			pinSelector = Lf.marker([latitud, longitud], { draggable: true })
				.bindTooltip('Tu local (arrastrame)')
				.addTo(m);
			pinSelector.on('dragend', () => {
				const pos = pinSelector!.getLatLng();
				oncambio?.(pos.lat, pos.lng);
			});
		}
		if (onvisibles) {
			const limites = limitesActuales();
			const visibles = limites ? puntos.filter((p) => dentroDeLimites(p, limites)) : puntos;
			untrack(() => onvisibles(visibles.map((p) => p.id)));
		}
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
