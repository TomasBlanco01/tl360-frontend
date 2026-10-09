<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { exigirAcceso } from '$lib/auth/guard';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from '$lib/_auditoria/toast.svelte';
	import { urlEmpresa } from '$lib/slug';
	import type { Categoria, Empresa, ReporteAdmin } from '$lib/types';
	import { validateForm, required } from '$lib/validation';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';

	// 1.4 La verificación comercial es la solapa principal del admin.
	let tab = $state('verificacion');

	let categorias = $state<Categoria[]>([]);
	let cargando = $state(true);
	let nombreNueva = $state('');
	let errorNueva = $state('');
	let editandoId = $state<number | null>(null);
	let nombreEditado = $state('');
	let mensaje = $state('');
	let guardando = $state(false);

	$effect(() => {
		if (!exigirAcceso('superadmin')) return;
		cargarCategorias();
		cargarPendientes();
	});

	// ---------- Verificación comercial (RF-15) ----------
	let pendientes = $state<Empresa[]>([]);
	let cargandoPendientes = $state(false);
	let errorPendientes = $state('');
	let procesandoId = $state<number | null>(null);

	function cargarPendientes() {
		cargandoPendientes = true;
		errorPendientes = '';
		api
			.get<Empresa[]>('/empresas?verificado_estado=pendiente')
			.then((res) => (pendientes = res))
			.catch((err) => {
				console.error(err);
				errorPendientes =
					err instanceof ApiError ? err.message : 'No se pudieron cargar las solicitudes.';
			})
			.finally(() => (cargandoPendientes = false));
	}

	async function resolverVerificacion(empresa: Empresa, accion: 'aprobar' | 'rechazar') {
		procesandoId = empresa.id;
		try {
			await api.put(`/empresas/${empresa.id}/verificacion`, { accion });
			pendientes = pendientes.filter((p) => p.id !== empresa.id);
			toast.exito(
				accion === 'aprobar'
					? `“${empresa.nombre}” verificado correctamente.`
					: `Verificación de “${empresa.nombre}” rechazada.`
			);
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo resolver la solicitud.');
		} finally {
			procesandoId = null;
		}
	}

	$effect(() => {
		if (
			tab === 'verificacion' &&
			auth.isSuperAdmin &&
			pendientes.length === 0 &&
			!cargandoPendientes &&
			!errorPendientes
		) {
			// Recarga al volver a la solapa (por si un dueño pidió verificación mientras tanto).
		}
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
			toast.exito('Reporte marcado como resuelto.');
		} catch (err) {
			errorReportes = err instanceof ApiError ? err.message : 'No se pudo resolver el reporte.';
			toast.error(errorReportes);
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
			toast.exito('Categoría creada.');
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo crear la categoría.';
			toast.error(mensaje);
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
			toast.exito('Categoría actualizada.');
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo actualizar la categoría.';
			toast.error(mensaje);
		} finally {
			guardando = false;
		}
	}

	// 2.2 Eliminar con modal accesible, no con `confirm()` nativo.
	let categoriaAEliminar: Categoria | null = $state(null);
	let eliminando = $state(false);

	function pedirEliminar(categoria: Categoria) {
		categoriaAEliminar = categoria;
	}

	async function confirmarEliminar() {
		if (!categoriaAEliminar) return;
		eliminando = true;
		mensaje = '';
		try {
			await api.delete(`/categorias/${categoriaAEliminar.id}`);
			toast.exito('Categoría eliminada.');
			categoriaAEliminar = null;
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo eliminar la categoría.';
			toast.error(mensaje);
		} finally {
			eliminando = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Administración</h1>
	<p class="mb-6 text-gray-500 dark:text-gray-400">Gestioná el catálogo general de TL360.</p>

	<Tabs
		tabs={[
			{ id: 'verificacion', label: 'Comercios pendientes de verificación' },
			{ id: 'categorias', label: 'Categorías' },
			{ id: 'reportes', label: 'Reportes' }
		]}
		bind:active={tab}
	/>

	<div class="mt-6">
		{#if tab === 'verificacion'}
			<Card class="p-6">
				<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Solicitudes de verificación
				</p>
				<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
					Revisá el CUIT y la constancia fiscal antes de otorgar el sello de verificado.
				</p>
				{#if errorPendientes}
					<p class="mb-3 text-sm text-danger-600">{errorPendientes}</p>
				{/if}
				{#if cargandoPendientes}
					<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
				{:else if pendientes.length === 0}
					<p class="text-sm text-gray-400 dark:text-gray-500">
						No hay comercios pendientes de verificación.
					</p>
				{:else}
					<ul class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
						{#each pendientes as comercio (comercio.id)}
							<li class="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
								<div class="min-w-0">
									<a
										href={urlEmpresa(comercio)}
										class="font-medium text-brand-600 hover:underline dark:text-brand-400"
									>
										{comercio.nombre}
									</a>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{comercio.categoria ?? ''} · {comercio.direccion}
									</p>
									<p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
										CUIT: <span class="font-mono">{comercio.cuit ?? '—'}</span>
									</p>
									{#if comercio.constancia_cuit_url}
										<a
											href={comercio.constancia_cuit_url}
											target="_blank"
											rel="noopener noreferrer"
											class="text-xs text-brand-600 hover:underline dark:text-brand-400"
										>
											Ver constancia fiscal ↗
										</a>
									{/if}
								</div>
								<div class="flex shrink-0 gap-2">
									<button
										disabled={procesandoId === comercio.id}
										onclick={() => resolverVerificacion(comercio, 'aprobar')}
										class="rounded-full bg-success-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
									>
										Aprobar Verificación
									</button>
									<button
										disabled={procesandoId === comercio.id}
										onclick={() => resolverVerificacion(comercio, 'rechazar')}
										class="rounded-full border border-danger-600 px-3 py-1.5 text-xs font-semibold text-danger-600 transition hover:bg-danger-50 disabled:opacity-50 dark:hover:bg-danger-600/10"
									>
										Rechazar
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		{:else if tab === 'categorias'}
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
											onclick={() => pedirEliminar(categoria)}
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
								<div class="flex shrink-0 gap-2">
									<button
										class="shrink-0 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
										onclick={() => resolverReporte(r.id)}
									>
										Marcar resuelto
									</button>
									<Badge tone="neutral">Reporte</Badge>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		{/if}
	</div>
</div>

<ConfirmModal
	abierto={categoriaAEliminar !== null}
	titulo="Eliminar categoría"
	descripcion={categoriaAEliminar
		? `¿Eliminar “${categoriaAEliminar.nombre}”? Solo se puede eliminar si no tiene comercios asignados.`
		: ''}
	confirmarTexto="Sí, eliminar"
	oncancelar={() => (categoriaAEliminar = null)}
	onconfirmar={confirmarEliminar}
	ocupado={eliminando}
/>
