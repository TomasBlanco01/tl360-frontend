<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import type { Categoria, ReporteAdmin } from '$lib/types';
	import { validateForm, required } from '$lib/validation';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';

	let tab = $state('categorias');

	let categorias = $state<Categoria[]>([]);
	let cargando = $state(true);
	let nombreNueva = $state('');
	let errorNueva = $state('');
	let editandoId = $state<number | null>(null);
	let nombreEditado = $state('');
	let mensaje = $state('');
	let guardando = $state(false);

	$effect(() => {
		if (!auth.user) {
			goto('/auth/login');
			return;
		}
		if (!auth.isSuperAdmin) {
			goto('/');
			return;
		}
		cargarCategorias();
	});

	// ---------- Reportes (RF-16) ----------
	let reportes = $state<ReporteAdmin[]>([]);
	let cargandoReportes = $state(false);
	let errorReportes = $state('');

	function cargarReportes() {
		cargandoReportes = true;
		errorReportes = '';
		api
			.get<ReporteAdmin[]>('/reportes')
			.then((res) => (reportes = res))
			.catch((err) => {
				console.error(err);
				errorReportes =
					err instanceof ApiError ? err.message : 'No se pudieron cargar los reportes.';
			})
			.finally(() => (cargandoReportes = false));
	}

	async function resolverReporte(id: number) {
		errorReportes = '';
		try {
			await api.put(`/reportes/${id}/resolver`);
			reportes = reportes.filter((r) => r.id !== id);
		} catch (err) {
			errorReportes = err instanceof ApiError ? err.message : 'No se pudo resolver el reporte.';
		}
	}

	$effect(() => {
		if (tab === 'reportes' && auth.isSuperAdmin) cargarReportes();
	});

	function cargarCategorias() {
		cargando = true;
		api
			.get<Categoria[]>('/categorias')
			.then((res) => (categorias = res))
			.catch((err) => console.error(err))
			.finally(() => (cargando = false));
	}

	async function crearCategoria() {
		mensaje = '';
		const errors = validateForm({ nombre: nombreNueva }, { nombre: [required()] });
		errorNueva = errors.nombre ?? '';
		if (errorNueva) return;

		guardando = true;
		try {
			await api.post<Categoria>('/categorias', { nombre: nombreNueva });
			nombreNueva = '';
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo crear la categoría.';
		} finally {
			guardando = false;
		}
	}

	function empezarEdicion(categoria: Categoria) {
		editandoId = categoria.id;
		nombreEditado = categoria.nombre;
	}

	async function guardarEdicion(id: number) {
		if (!nombreEditado.trim()) return;
		mensaje = '';
		guardando = true;
		try {
			await api.put(`/categorias/${id}`, { nombre: nombreEditado });
			editandoId = null;
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo actualizar la categoría.';
		} finally {
			guardando = false;
		}
	}

	async function borrarCategoria(id: number) {
		if (
			!confirm('¿Eliminar esta categoría? Solo se puede eliminar si no tiene comercios asignados.')
		)
			return;
		mensaje = '';
		try {
			await api.delete(`/categorias/${id}`);
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo eliminar la categoría.';
		}
	}
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Administración</h1>
	<p class="mb-6 text-gray-500 dark:text-gray-400">Gestioná el catálogo general de TL360.</p>

	<Tabs
		tabs={[
			{ id: 'categorias', label: 'Categorías' },
			{ id: 'reportes', label: 'Reportes' }
		]}
		bind:active={tab}
	/>

	<div class="mt-6">
		{#if tab === 'categorias'}
			<Card class="p-6">
				<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Nueva categoría</p>
				<div class="flex items-start gap-2">
					<div class="flex-1">
						<FormField label="Nombre" bind:value={nombreNueva} error={errorNueva} />
					</div>
					<Button class="mt-6" disabled={guardando} onclick={crearCategoria}>Agregar</Button>
				</div>

				{#if mensaje}
					<p class="mt-3 text-sm text-danger-600">{mensaje}</p>
				{/if}
			</Card>

			<Card class="mt-4 p-6">
				<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Categorías existentes
				</p>
				{#if cargando}
					<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
				{:else if categorias.length === 0}
					<p class="text-sm text-gray-400 dark:text-gray-500">
						Todavía no hay categorías cargadas.
					</p>
				{:else}
					<ul class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
						{#each categorias as categoria (categoria.id)}
							<li class="flex items-center justify-between gap-2 py-2.5">
								{#if editandoId === categoria.id}
									<input
										bind:value={nombreEditado}
										class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
									/>
									<button
										class="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
										onclick={() => guardarEdicion(categoria.id)}
									>
										Guardar
									</button>
									<button
										class="text-sm text-gray-500 hover:underline dark:text-gray-400"
										onclick={() => (editandoId = null)}
									>
										Cancelar
									</button>
								{:else}
									<span class="text-sm text-gray-800 dark:text-gray-100">{categoria.nombre}</span>
									<div class="flex gap-3">
										<button
											class="text-sm text-brand-600 hover:underline dark:text-brand-400"
											onclick={() => empezarEdicion(categoria)}
										>
											Editar
										</button>
										<button
											class="text-sm text-danger-600 hover:underline"
											onclick={() => borrarCategoria(categoria.id)}
										>
											Eliminar
										</button>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		{:else if tab === 'reportes'}
			<Card class="p-6">
				<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Reportes pendientes
				</p>
				{#if errorReportes}
					<p class="mb-3 text-sm text-danger-600">{errorReportes}</p>
				{/if}
				{#if cargandoReportes}
					<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
				{:else if reportes.length === 0}
					<p class="text-sm text-gray-400 dark:text-gray-500">No hay reportes pendientes.</p>
				{:else}
					<ul class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
						{#each reportes as r (r.id)}
							<li class="flex items-start justify-between gap-3 py-3">
								<div class="min-w-0">
									<a
										href="/comercios/{r.empresa_id}"
										class="font-medium text-brand-600 hover:underline dark:text-brand-400"
										>{r.empresa_nombre}</a
									>
									<p class="text-sm text-gray-700 dark:text-gray-300">{r.motivo}</p>
									<p class="text-xs text-gray-400 dark:text-gray-500">
										Reportado por {r.usuario_nombre ?? 'un usuario eliminado'}
									</p>
								</div>
								<button
									class="shrink-0 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
									onclick={() => resolverReporte(r.id)}
								>
									Marcar resuelto
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		{/if}
	</div>
</div>
