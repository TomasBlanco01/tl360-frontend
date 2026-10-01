<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { api } from '$lib/api';
	import type { Categoria, Empresa } from '$lib/types';
	import EmpresaCard from '$lib/components/EmpresaCard.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// El catálogo real tiene miles de comercios: la búsqueda y la paginación las hace el backend.
	const POR_PAGINA = 24;

	let categorias = $state<Categoria[]>([]);
	let empresas = $state<Empresa[]>([]);
	let hayMas = $state(false);
	let cargando = $state(true);
	let query = $state(page.url.searchParams.get('q') ?? '');
	let categoriaId = $state(page.url.searchParams.get('categoria') ?? '');
	let pedido = 0;

	$effect(() => {
		api
			.get<Categoria[]>('/categorias')
			.then((res) => (categorias = res))
			.catch((err) => console.error(err));
	});

	async function cargar(q: string, cat: string, reiniciar: boolean) {
		const miPedido = ++pedido;
		cargando = true;
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q.trim());
		if (cat) params.set('categoria_id', cat);
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
		} finally {
			if (miPedido === pedido) cargando = false;
		}
	}

	// Recarga (con una pequeña espera mientras se escribe) cuando cambia la búsqueda o el rubro.
	$effect(() => {
		const q = query;
		const cat = categoriaId;
		const t = setTimeout(() => untrack(() => cargar(q, cat, true)), 250);
		return () => clearTimeout(t);
	});

	function aplicarFiltros() {
		const params = new URLSearchParams();
		if (query.trim()) params.set('q', query.trim());
		if (categoriaId) params.set('categoria', categoriaId);
		goto(`/comercios${params.toString() ? `?${params}` : ''}`, { keepFocus: true, noScroll: true });
	}
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
	<h1 class="mb-6 text-2xl font-bold text-gray-800 dark:text-gray-100">Comercios</h1>

	<div class="mb-6 flex flex-col gap-3 sm:flex-row">
		<input
			type="search"
			bind:value={query}
			oninput={aplicarFiltros}
			placeholder="Buscar por nombre o rubro..."
			class="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-gray-800 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
		/>
		<select
			bind:value={categoriaId}
			onchange={aplicarFiltros}
			class="rounded-full border border-gray-200 bg-white px-4 py-2.5 text-gray-800 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
		>
			<option value="">Todos los rubros</option>
			{#each categorias.filter((c) => c.cantidad !== 0) as categoria (categoria.id)}
				<option value={categoria.id}>{categoria.nombre}</option>
			{/each}
		</select>
	</div>

	{#if empresas.length === 0 && cargando}
		<p class="text-sm text-gray-400 dark:text-gray-500">Cargando comercios...</p>
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
					onclick={() => cargar(query, categoriaId, false)}
					disabled={cargando}
				>
					{cargando ? 'Cargando...' : 'Cargar más comercios'}
				</Button>
			</div>
		{/if}
	{/if}
</div>
