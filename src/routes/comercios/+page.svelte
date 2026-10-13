<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { api } from '$lib/api';
	import type { Categoria, Empresa, PuntoMapa } from '$lib/types';
	import { CATALOGO_ETIQUETAS, parsearEtiquetasParam } from '$lib/etiquetas';
	import EmpresaCard from '$lib/components/EmpresaCard.svelte';
	import MapaComercios from '$lib/components/MapaComercios.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// El catálogo real tiene miles de comercios: la búsqueda y la paginación las hace el backend.
	const POR_PAGINA = 24;

	let categorias = $state<Categoria[]>([]);
	let empresas = $state<Empresa[]>([]);
	let hayMas = $state(false);
	let cargando = $state(true);
	let error = $state('');
	let query = $state(page.url.searchParams.get('q') ?? '');
	// 2.6 El <select> trabaja con strings: normalizar a string desde el inicio.
	let categoriaId = $state(page.url.searchParams.get('categoria') ?? '');
	let etiquetas = $state<string[]>(parsearEtiquetasParam(page.url.searchParams.get('etiquetas')));
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
			.get<Categoria[]>('/categorias')
			.then((res) => (categorias = res))
			.catch((err) => console.error(err));
	});

	async function cargar(q: string, cat: string, tags: string[], reiniciar: boolean) {
		const miPedido = ++pedido;
		cargando = true;
		if (reiniciar) error = '';
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q.trim());
		if (cat) params.set('categoria_id', cat);
		if (tags.length > 0) params.set('etiquetas', tags.join(','));
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
		const t = setTimeout(() => untrack(() => cargar(q, cat, [...tags], true)), 300);
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

	function alternarEtiqueta(tag: string) {
		etiquetas = etiquetas.includes(tag) ? etiquetas.filter((t) => t !== tag) : [...etiquetas, tag];
		aplicarFiltros();
	}

	function cambiarVista(v: 'lista' | 'mapa') {
		vista = v;
		aplicarFiltros();
	}

	const puntos = $derived<PuntoMapa[]>(
		empresas
			.filter((e) => e.lat != null && e.lng != null)
			.map((e) => ({
				id: e.id,
				nombre: e.nombre,
				lat: e.lat!,
				lng: e.lng!,
				slug: e.slug,
				verificado: e.verificado || e.verificado_estado === 'verificado'
			}))
	);
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
		<select
			bind:value={categoriaId}
			onchange={aplicarFiltros}
			aria-label="Filtrar por rubro"
			class="rounded-full border border-gray-200 bg-white px-4 py-2.5 text-gray-800 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
		>
			<option value="">Todos los rubros</option>
			{#each categorias.filter((c) => c.cantidad !== 0) as categoria (categoria.id)}
				<option value={String(categoria.id)}>{categoria.nombre}</option>
			{/each}
		</select>
	</div>

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
		{#if error && empresas.length === 0}
			<EmptyState title="No pudimos cargar el mapa" description={error}>
				<Button onclick={() => cargar(query, categoriaId, etiquetas, true)}>Reintentar</Button>
			</EmptyState>
		{:else}
			<div class="overflow-hidden rounded-card shadow-[var(--shadow-card)]">
				<MapaComercios
					{puntos}
					alto="h-[60vh]"
					cargandoDatos={cargando}
					onseleccionar={(id) => {
						const e = empresas.find((x) => x.id === id);
						goto(e?.slug ? `/comercios/${e.slug}` : `/comercios/${id}`);
					}}
				/>
			</div>
		{/if}
		<p class="mt-3 text-sm text-gray-400 dark:text-gray-500">
			{puntos.length}
			{puntos.length === 1 ? 'comercio' : 'comercios'} en el mapa con los filtros actuales.
		</p>
		{#if empresas.length > 0}
			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each empresas as empresa (empresa.id)}
					<EmpresaCard {empresa} />
				{/each}
			</div>
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
