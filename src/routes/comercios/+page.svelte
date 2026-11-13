<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { api } from '$lib/api';
	import type { Rubro, Empresa, PuntoMapa } from '$lib/types';
	import { CATALOGO_ETIQUETAS, parsearEtiquetasParam } from '$lib/etiquetas';
	import EmpresaCard from '$lib/components/EmpresaCard.svelte';
	import MapaComercios from '$lib/components/MapaComercios.svelte';
	import SelectorRubro from '$lib/components/SelectorRubro.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// El catálogo real tiene miles de comercios: la búsqueda y la paginación las hace el backend.
	const POR_PAGINA = 24;

	type Ubicacion = { lat: number; lng: number };

	let categorias = $state<Rubro[]>([]);
	let empresas = $state<Empresa[]>([]);
	let hayMas = $state(false);
	let cargando = $state(true);
	let error = $state('');
	let query = $state(page.url.searchParams.get('q') ?? '');
	// 2.6 El <select> trabaja con strings: normalizar a string desde el inicio.
	let categoriaId = $state(page.url.searchParams.get('categoria') ?? '');
	let etiquetas = $state<string[]>(parsearEtiquetasParam(page.url.searchParams.get('etiquetas')));
	// RNF-05: la ubicación precisa vive solo en memoria; nunca se escribe en la URL.
	let ubicacion = $state<Ubicacion | null>(null);
	let geolocalizando = $state(false);
	let avisoUbicacion = $state('');
	// 2.1 Vista unificada Lista | Mapa (el mapa vive acá, no en /mapa separado).
	let vista = $state<'lista' | 'mapa'>(
		page.url.searchParams.get('vista') === 'mapa' ? 'mapa' : 'lista'
	);
	let pedido = 0;

	// Sincronizar estado si el usuario navega con atrás/adelante.
	$effect(() => {
		const url = page.url;
		untrack(() => {
			const q = url.searchParams.get('q') ?? '';
			const cat = url.searchParams.get('categoria') ?? '';
			const et = parsearEtiquetasParam(url.searchParams.get('etiquetas'));
			const v = url.searchParams.get('vista') === 'mapa' ? 'mapa' : 'lista';
			if (q !== query) query = q;
			if (cat !== categoriaId) categoriaId = cat;
			if (JSON.stringify(et) !== JSON.stringify(etiquetas)) etiquetas = et;
			if (v !== vista) vista = v;
		});
	});

	$effect(() => {
		api
			.get<Rubro[]>('/rubros')
			.then((res) => (categorias = res))
			.catch((err) => console.error(err));
	});

	async function cargar(
		q: string,
		cat: string,
		tags: string[],
		reiniciar: boolean,
		geo: Ubicacion | null = ubicacion
	) {
		const miPedido = ++pedido;
		cargando = true;
		if (reiniciar) error = '';
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q.trim());
		if (cat) params.set('rubro_id', cat);
		if (tags.length > 0) params.set('etiquetas', tags.join(','));
		if (geo) {
			params.set('lat', String(geo.lat));
			params.set('lng', String(geo.lng));
		}
		params.set('limit', String(POR_PAGINA + 1));
		params.set('offset', String(reiniciar ? 0 : empresas.length));
		try {
			const res = await api.get<Empresa[]>(`/empresas?${params}`);
			if (miPedido !== pedido) return; // llegó una búsqueda más nueva
			hayMas = res.length > POR_PAGINA;
			const pagina = res.slice(0, POR_PAGINA);
			empresas = reiniciar ? pagina : [...empresas, ...pagina];
		} catch (err) {
			console.error(err);
			if (reiniciar) error = 'No pudimos cargar los comercios. Revisá tu conexión.';
		} finally {
			if (miPedido === pedido) cargando = false;
		}
	}

	// Recarga (con debounce de 300ms mientras se escribe — 1.7) cuando cambia búsqueda/rubro/etiquetas.
	$effect(() => {
		const q = query;
		const cat = categoriaId;
		const tags = etiquetas;
		const geo = ubicacion;
		const t = setTimeout(() => untrack(() => cargar(q, cat, [...tags], true, geo)), 300);
		return () => clearTimeout(t);
	});

	function aplicarFiltros() {
		const params = new URLSearchParams();
		if (query.trim()) params.set('q', query.trim());
		if (categoriaId) params.set('categoria', categoriaId);
		if (etiquetas.length > 0) params.set('etiquetas', etiquetas.join(','));
		if (vista === 'mapa') params.set('vista', 'mapa');
		goto(`/comercios${params.toString() ? `?${params}` : ''}`, { keepFocus: true, noScroll: true });
	}

	function pedirUbicacion() {
		avisoUbicacion = '';
		if (!navigator.geolocation) {
			avisoUbicacion = 'Tu navegador no permite obtener la ubicación.';
			return;
		}
		geolocalizando = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				geolocalizando = false;
				ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
				aplicarFiltros();
			},
			() => {
				geolocalizando = false;
				avisoUbicacion =
					'No pudimos obtener tu ubicación. Revisá el permiso del navegador e intentá de nuevo.';
			},
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
		);
	}

	function quitarUbicacion() {
		ubicacion = null;
		avisoUbicacion = '';
		aplicarFiltros();
	}

	function alternarEtiqueta(tag: string) {
		etiquetas = etiquetas.includes(tag) ? etiquetas.filter((t) => t !== tag) : [...etiquetas, tag];
		aplicarFiltros();
	}

	function cambiarVista(v: 'lista' | 'mapa') {
		vista = v;
		aplicarFiltros();
	}

	// ---------- Vista mapa ----------
	// El mapa muestra TODOS los comercios que cumplen los filtros (no solo la página cargada) y el
	// listado de abajo sigue a los que quedan a la vista: al acercarse o moverse, se actualiza.
	let puntos = $state<PuntoMapa[]>([]);
	let cargandoPuntos = $state(false);
	let pedidoPuntos = 0;
	let visibles = $state<number[]>([]);
	let fichasMapa = $state<Empresa[]>([]);
	let cargandoFichas = $state(false);
	let pedidoFichas = 0;

	async function cargarPuntos(q: string, cat: string, tags: string[]) {
		const miPedido = ++pedidoPuntos;
		cargandoPuntos = true;
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q.trim());
		if (cat) params.set('rubro_id', cat);
		if (tags.length > 0) params.set('etiquetas', tags.join(','));
		try {
			const res = await api.get<PuntoMapa[]>(
				`/empresas/mapa${params.toString() ? `?${params}` : ''}`
			);
			if (miPedido !== pedidoPuntos) return;
			puntos = res;
		} catch (err) {
			console.error(err);
			if (miPedido === pedidoPuntos) error = 'No pudimos cargar el mapa. Revisá tu conexión.';
		} finally {
			if (miPedido === pedidoPuntos) cargandoPuntos = false;
		}
	}

	$effect(() => {
		if (vista !== 'mapa') return;
		const q = query;
		const cat = categoriaId;
		const tags = etiquetas;
		const t = setTimeout(() => untrack(() => cargarPuntos(q, cat, [...tags])), 300);
		return () => clearTimeout(t);
	});

	/** Las fichas de los comercios a la vista, de a una página. */
	async function cargarFichasVisibles(reiniciar: boolean) {
		const desde = reiniciar ? 0 : fichasMapa.length;
		const ids = visibles.slice(desde, desde + POR_PAGINA);
		const miPedido = ++pedidoFichas;
		if (ids.length === 0) {
			if (reiniciar) fichasMapa = [];
			return;
		}
		cargandoFichas = true;
		try {
			const res = await api.get<Empresa[]>(`/empresas?ids=${ids.join(',')}`);
			if (miPedido !== pedidoFichas) return;
			fichasMapa = reiniciar ? res : [...fichasMapa, ...res];
		} catch (err) {
			console.error(err);
		} finally {
			if (miPedido === pedidoFichas) cargandoFichas = false;
		}
	}

	// Al moverse el mapa, espera a que se quede quieto antes de pedir las fichas.
	$effect(() => {
		if (vista !== 'mapa') return;
		void visibles;
		const t = setTimeout(() => untrack(() => cargarFichasVisibles(true)), 250);
		return () => clearTimeout(t);
	});

	function alCambiarVisibles(ids: number[]) {
		if (ids.length === visibles.length && ids.every((id, i) => id === visibles[i])) return;
		visibles = ids;
	}
</script>

<svelte:head>
	<title>Comercios en Trenque Lauquen — TL360</title>
	<meta
		name="description"
		content="Directorio de comercios y servicios de Trenque Lauquen: filtrá por rubro, accesibilidad y reservá turno online."
	/>
	<link rel="canonical" href="https://tl360.local/comercios" />
	<meta property="og:title" content="Comercios en Trenque Lauquen — TL360" />
	<meta property="og:type" content="website" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Comercios</h1>
		<!-- 2.1 Selector conmutable Lista | Mapa -->
		<div
			class="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-[var(--shadow-card)] dark:border-gray-700 dark:bg-gray-900"
			role="tablist"
			aria-label="Vista del directorio"
		>
			<button
				role="tab"
				aria-selected={vista === 'lista'}
				onclick={() => cambiarVista('lista')}
				class="rounded-full px-4 py-1.5 text-sm font-semibold transition {vista === 'lista'
					? 'bg-brand-500 text-white'
					: 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'}"
			>
				📋 Lista
			</button>
			<button
				role="tab"
				aria-selected={vista === 'mapa'}
				onclick={() => cambiarVista('mapa')}
				class="rounded-full px-4 py-1.5 text-sm font-semibold transition {vista === 'mapa'
					? 'bg-brand-500 text-white'
					: 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'}"
			>
				🗺️ Mapa
			</button>
		</div>
	</div>

	<div class="mb-4 flex flex-col gap-3 sm:flex-row">
		<input
			type="search"
			bind:value={query}
			oninput={aplicarFiltros}
			placeholder="Buscar por nombre o rubro... (probá 'comida', 'peluqueria', 'gym')"
			aria-label="Buscar comercios"
			class="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-gray-800 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
		/>
		<div class="sm:w-72">
			<SelectorRubro
				id="filtro-rubro"
				label="Filtrar por rubro"
				variante="pildora"
				opcionVacia="Todos los rubros"
				ocultarVacios
				mostrarCantidad
				rubros={categorias}
				bind:value={categoriaId}
				onchange={aplicarFiltros}
			/>
		</div>
	</div>

	<div class="mb-4 flex flex-wrap items-center gap-3">
		<button
			type="button"
			aria-pressed={ubicacion != null}
			disabled={geolocalizando}
			onclick={ubicacion ? quitarUbicacion : pedirUbicacion}
			class="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 {ubicacion
				? 'border-brand-500 bg-brand-500 text-white'
				: 'border-brand-500 text-brand-600 hover:bg-brand-50 dark:hover:bg-gray-800'}"
		>
			<span aria-hidden="true">📍</span>
			{geolocalizando ? 'Buscando ubicación…' : ubicacion ? 'Cerca de mí (activo)' : 'Cerca de mí'}
		</button>
		{#if ubicacion}
			<span class="text-xs text-gray-500 dark:text-gray-400">
				Ordenados por cercanía; los abiertos primero.
			</span>
		{/if}
	</div>

	{#if avisoUbicacion}
		<p
			class="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
			role="alert"
		>
			{avisoUbicacion}
		</p>
	{/if}

	<!-- 1.6 Filtro por etiquetas de accesibilidad y servicios -->
	<div class="mb-6 flex flex-wrap gap-2" aria-label="Filtrar por accesibilidad y servicios">
		{#each CATALOGO_ETIQUETAS as tag (tag)}
			{@const activa = etiquetas.includes(tag)}
			<button
				type="button"
				aria-pressed={activa}
				onclick={() => alternarEtiqueta(tag)}
				class="rounded-full border px-3 py-1.5 text-xs font-semibold transition {activa
					? 'border-brand-500 bg-brand-500 text-white'
					: 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'}"
			>
				{activa ? '✓ ' : ''}{tag}
			</button>
		{/each}
		{#if etiquetas.length > 0}
			<button
				type="button"
				onclick={() => {
					etiquetas = [];
					aplicarFiltros();
				}}
				class="rounded-full px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 hover:underline dark:hover:text-gray-200"
			>
				Limpiar filtros
			</button>
		{/if}
	</div>

	{#if vista === 'mapa'}
		{#if error && puntos.length === 0}
			<EmptyState title="No pudimos cargar el mapa" description={error}>
				<Button onclick={() => cargarPuntos(query, categoriaId, etiquetas)}>Reintentar</Button>
			</EmptyState>
		{:else}
			<div class="overflow-hidden rounded-card shadow-[var(--shadow-card)]">
				<MapaComercios
					{puntos}
					yo={ubicacion ? [ubicacion.lat, ubicacion.lng] : null}
					alto="h-[60vh]"
					cargandoDatos={cargandoPuntos}
					onvisibles={alCambiarVisibles}
				/>
			</div>
		{/if}
		<p class="mt-3 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
			{#if cargandoPuntos && puntos.length === 0}
				Cargando comercios del mapa…
			{:else}
				<strong class="text-gray-700 dark:text-gray-200">{visibles.length}</strong>
				{visibles.length === 1 ? 'comercio' : 'comercios'} en esta zona del mapa
				<span class="text-gray-400 dark:text-gray-500">
					(de {puntos.length} con ubicación para estos filtros). Acercate o mové el mapa y la lista se
					actualiza.
				</span>
			{/if}
		</p>
		{#if fichasMapa.length > 0}
			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each fichasMapa as empresa (empresa.id)}
					<EmpresaCard {empresa} />
				{/each}
			</div>
			{#if fichasMapa.length < visibles.length}
				<div class="mt-8 flex justify-center">
					<Button
						variant="outline"
						onclick={() => cargarFichasVisibles(false)}
						disabled={cargandoFichas}
					>
						{cargandoFichas
							? 'Cargando...'
							: `Ver más (${visibles.length - fichasMapa.length} en esta zona)`}
					</Button>
				</div>
			{/if}
		{:else if !cargandoPuntos && visibles.length === 0 && puntos.length > 0}
			<p class="mt-4 text-sm text-gray-400 dark:text-gray-500">
				No hay comercios en esta zona. Alejá el mapa para ver más.
			</p>
		{/if}
	{:else if empresas.length === 0 && cargando}
		<p class="text-sm text-gray-400 dark:text-gray-500" role="status">Cargando comercios...</p>
	{:else if error && empresas.length === 0}
		<EmptyState title="No pudimos cargar los comercios" description={error}>
			<Button onclick={() => cargar(query, categoriaId, etiquetas, true)}>Reintentar</Button>
		</EmptyState>
	{:else if empresas.length === 0}
		<EmptyState
			title="No encontramos comercios"
			description="Probá con otra búsqueda o elegí otro rubro."
		/>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each empresas as empresa (empresa.id)}
				<EmpresaCard {empresa} />
			{/each}
		</div>
		{#if hayMas}
			<div class="mt-8 flex justify-center">
				<Button
					variant="outline"
					onclick={() => cargar(query, categoriaId, etiquetas, false)}
					disabled={cargando}
				>
					{cargando ? 'Cargando...' : 'Cargar más comercios'}
				</Button>
			</div>
		{/if}
	{/if}
</div>
