<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { Categoria, Empresa } from '$lib/types';
	import { publicidades } from '$lib/stores/publicidades.svelte';
	import EmpresaCard from '$lib/components/EmpresaCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PublicidadCarousel from '$lib/components/PublicidadCarousel.svelte';

	import Scissors from '@lucide/svelte/icons/scissors';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import Hand from '@lucide/svelte/icons/hand';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Flower from '@lucide/svelte/icons/flower';
	import PenTool from '@lucide/svelte/icons/pen-tool';
	import Brush from '@lucide/svelte/icons/brush';
	import Gem from '@lucide/svelte/icons/gem';
	import Footprints from '@lucide/svelte/icons/footprints';
	import PersonStanding from '@lucide/svelte/icons/person-standing';
	import Salad from '@lucide/svelte/icons/salad';
	import Droplet from '@lucide/svelte/icons/droplet';
	import Activity from '@lucide/svelte/icons/activity';
	import Palette from '@lucide/svelte/icons/palette';
	import Swords from '@lucide/svelte/icons/swords';
	import HandHeart from '@lucide/svelte/icons/hand-heart';
	import Sun from '@lucide/svelte/icons/sun';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import Croissant from '@lucide/svelte/icons/croissant';
	import Beef from '@lucide/svelte/icons/beef';
	import Carrot from '@lucide/svelte/icons/carrot';
	import Hammer from '@lucide/svelte/icons/hammer';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Shirt from '@lucide/svelte/icons/shirt';
	import Utensils from '@lucide/svelte/icons/utensils';
	import Home from '@lucide/svelte/icons/home';
	import PawPrint from '@lucide/svelte/icons/paw-print';
	import type { Component } from 'svelte';

	const iconMap: Record<string, Component> = {
		Peluquería: Scissors,
		Gimnasio: Dumbbell,
		Masajes: Hand,
		Estética: Sparkles,
		Depilación: Flower,
		Tatuajes: PenTool,
		Barbería: Brush,
		'Manicuría y Pedicura': Gem,
		Podología: Footprints,
		'Yoga y Pilates': PersonStanding,
		Nutrición: Salad,
		Cosmiatría: Droplet,
		'Kinesiología y Fisioterapia': Activity,
		Maquillaje: Palette,
		'Artes Marciales': Swords,
		'Terapias Alternativas y Reiki': HandHeart,
		Solárium: Sun,
		'Almacén y Kiosco': ShoppingBag,
		Panadería: Croissant,
		Carnicería: Beef,
		'Verdulería y Frutería': Carrot,
		Ferretería: Hammer,
		'Librería y Papelería': BookOpen,
		'Indumentaria y Calzado': Shirt,
		Gastronomía: Utensils,
		Inmobiliaria: Home,
		Veterinaria: PawPrint
	};

	let categorias = $state<Categoria[]>([]);
	let empresas = $state<Empresa[]>([]);
	let query = $state('');

	const MAX_VISIBLES = 14;
	let abiertos = $state(new Set<string>());

	function toggleGrupo(nombre: string) {
		const s = new Set(abiertos);
		if (s.has(nombre)) s.delete(nombre);
		else s.add(nombre);
		abiertos = s;
	}

	// Rubros agrupados por súper rubro; sin backend real (mock) todo cae en un único grupo.
	const grupos = $derived.by(() => {
		const porGrupo = new Map<string, Categoria[]>();
		for (const c of categorias) {
			if (c.cantidad === 0) continue;
			const nombre = c.super_rubro ?? 'Rubros';
			porGrupo.set(nombre, [...(porGrupo.get(nombre) ?? []), c]);
		}
		return [...porGrupo]
			.map(([nombre, cats]) => ({
				nombre,
				categorias: cats.sort(
					(x, y) => (y.cantidad ?? 0) - (x.cantidad ?? 0) || x.nombre.localeCompare(y.nombre)
				),
				total: cats.reduce((s, c) => s + (c.cantidad ?? 0), 0)
			}))
			.sort((x, y) => y.total - x.total);
	});

	$effect(() => {
		api
			.get<Categoria[]>('/categorias')
			.then((res) => (categorias = res))
			.catch((err) => console.error('Error al obtener categorías:', err));

		api
			.get<Empresa[]>('/empresas?limit=6')
			.then((res) => (empresas = res))
			.catch((err) => console.error('Error al obtener empresas:', err));
	});

	function handleSearch(e: SubmitEvent) {
		e.preventDefault();
		goto(`/comercios${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
	}

	function goToCategoria(categoria: Categoria) {
		goto(`/comercios?categoria=${categoria.id}`);
	}
</script>

<!-- Hero -->
<section
	class="bg-gradient-to-b from-brand-100 to-white px-4 py-14 text-center dark:from-gray-900 dark:to-gray-950"
>
	<h1 class="mx-auto max-w-2xl text-3xl font-extrabold text-brand-900 sm:text-4xl dark:text-white">
		Encontrá lo que necesitas en Trenque Lauquen
	</h1>
	<p class="mx-auto mt-3 max-w-lg text-gray-600 dark:text-gray-400">
		El directorio de comercios y servicios de la ciudad — reservá turno donde se pueda, contactá
		directo donde no.
	</p>

	<form onsubmit={handleSearch} class="mx-auto mt-8 flex max-w-lg gap-2">
		<input
			type="search"
			bind:value={query}
			placeholder="Buscar por nombre o rubro..."
			class="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-5 py-3 text-gray-800 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
		/>
		<Button type="submit" size="lg">Buscar</Button>
	</form>
</section>

<!-- Publicidades destacadas -->
{#if publicidades.items.length > 0}
	<section class="mx-auto max-w-6xl px-4 pt-10">
		<h2 class="mb-5 text-xl font-bold text-gray-800 dark:text-gray-100">Destacados</h2>
		<PublicidadCarousel items={publicidades.items} />
	</section>
{/if}

<!-- Categorías -->
<section class="mx-auto max-w-6xl px-4 py-10">
	<h2 class="mb-5 text-xl font-bold text-gray-800 dark:text-gray-100">Explorá por rubro</h2>
	{#if categorias.length === 0}
		<p class="text-sm text-gray-400 dark:text-gray-500">Cargando categorías...</p>
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			{#each grupos as grupo (grupo.nombre)}
				<div class="rounded-card bg-white p-5 shadow-[var(--shadow-card)] dark:bg-gray-900">
					<p
						class="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
					>
						{grupo.nombre}
						<span class="font-normal text-gray-400 dark:text-gray-500"
							>· {grupo.total} comercios</span
						>
					</p>
					<div class="flex flex-wrap gap-2">
						{#each abiertos.has(grupo.nombre) ? grupo.categorias : grupo.categorias.slice(0, MAX_VISIBLES) as categoria (categoria.id)}
							{@const Icon = iconMap[categoria.nombre]}
							<button
								class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
								onclick={() => goToCategoria(categoria)}
							>
								{#if Icon}<Icon
										class="h-4 w-4 text-brand-500 dark:text-brand-400"
										strokeWidth={1.5}
									/>{/if}
								{categoria.nombre}
								{#if categoria.cantidad}<span class="text-xs text-gray-400 dark:text-gray-500"
										>{categoria.cantidad}</span
									>{/if}
								{#if categoria.turnos_habilitados}<span
										title="Con reserva de turnos"
										class="h-1.5 w-1.5 rounded-full bg-brand-500"
									></span>{/if}
							</button>
						{/each}
					</div>
					{#if grupo.categorias.length > MAX_VISIBLES}
						<button
							class="mt-3 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
							onclick={() => toggleGrupo(grupo.nombre)}
						>
							{abiertos.has(grupo.nombre)
								? 'Ver menos'
								: `Ver los ${grupo.categorias.length} rubros`}
						</button>
					{/if}
				</div>
			{/each}
		</div>
		<p class="mt-4 text-xs text-gray-400 dark:text-gray-500">
			<span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-500"></span>Con reserva de
			turnos online — el resto también está en el directorio, con contacto directo
		</p>
	{/if}
</section>

<!-- Comercios -->
<section class="mx-auto max-w-6xl px-4 py-10">
	<div class="mb-5 flex items-center justify-between">
		<h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Comercios</h2>
		<a
			href="/comercios"
			class="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">Ver todos</a
		>
	</div>

	{#if empresas.length === 0}
		<p class="text-sm text-gray-400 dark:text-gray-500">Cargando comercios...</p>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each empresas.slice(0, 6) as empresa (empresa.id)}
				<EmpresaCard {empresa} />
			{/each}
		</div>
	{/if}
</section>
