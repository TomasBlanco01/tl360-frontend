<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { exigirAcceso } from '$lib/auth/guard';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from '$lib/_auditoria/toast.svelte';
	import { urlEmpresa } from '$lib/slug';
	import type {
		Categoria,
		Empresa,
		Publicidad,
		ReporteAdmin,
		SolicitudPublicidad,
		TurnoRecibido,
		Usuario
	} from '$lib/types';
	import { validateForm, required, email } from '$lib/validation';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';

	// 1.4 La verificación comercial es la solapa principal del admin.
	let tab = $state('verificacion');

	let categorias = $state<Categoria[]>([]);
	let cargando = $state(false);
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

	// ---------- Comercios (superadmin: CRUD total + verificado + turnos) ----------
	let comercios = $state<Empresa[]>([]);
	let cargandoComercios = $state(false);
	let errorComercios = $state('');
	let qComercio = $state('');
	let filtroCategoria = $state('');
	let comerciosCargados = $state(false);

	let creandoComercio = $state(false);
	let nuevoComercio = $state({
		nombre: '',
		direccion: '',
		telefono: '',
		slogan: '',
		categoria_id: '',
		admin_id: '',
		turnos_habilitados: true
	});
	let errorNuevoComercio = $state('');
	let guardandoComercio = $state(false);

	let editandoComercioId = $state<number | null>(null);
	let formComercio = $state({
		nombre: '',
		direccion: '',
		telefono: '',
		slogan: '',
		categoria_id: '',
		admin_id: ''
	});
	let comercioAEliminar: Empresa | null = $state(null);
	let eliminandoComercio = $state(false);
	let alternandoVerificadoId = $state<number | null>(null);

	let turnosComercioId = $state<number | null>(null);
	let turnosComercio = $state<TurnoRecibido[]>([]);
	let cargandoTurnos = $state(false);

	$effect(() => {
		if (tab === 'comercios' && auth.isSuperAdmin && !comerciosCargados) {
			cargarComercios();
		}
	});

	function queryComercios() {
		const p = new URLSearchParams();
		if (qComercio.trim()) p.set('q', qComercio.trim());
		if (filtroCategoria) p.set('categoria_id', filtroCategoria);
		const qs = p.toString();
		return `/empresas${qs ? `?${qs}` : ''}`;
	}

	function cargarComercios() {
		cargandoComercios = true;
		errorComercios = '';
		api
			.get<Empresa[]>(queryComercios())
			.then((res) => {
				comercios = res;
				comerciosCargados = true;
			})
			.catch((err) => {
				console.error(err);
				errorComercios =
					err instanceof ApiError ? err.message : 'No se pudieron cargar los comercios.';
			})
			.finally(() => (cargandoComercios = false));
	}

	async function crearComercio() {
		errorNuevoComercio = '';
		if (!nuevoComercio.nombre.trim() || !nuevoComercio.direccion.trim()) {
			errorNuevoComercio = 'Nombre y dirección son obligatorios.';
			return;
		}
		if (!nuevoComercio.categoria_id) {
			errorNuevoComercio = 'Elegí una categoría.';
			return;
		}
		guardandoComercio = true;
		try {
			const payload: Record<string, unknown> = {
				nombre: nuevoComercio.nombre.trim(),
				direccion: nuevoComercio.direccion.trim(),
				telefono: nuevoComercio.telefono.trim() || undefined,
				slogan: nuevoComercio.slogan.trim() || undefined,
				categoria_id: Number(nuevoComercio.categoria_id),
				turnos_habilitados: nuevoComercio.turnos_habilitados
			};
			if (nuevoComercio.admin_id.trim()) payload.admin_id = Number(nuevoComercio.admin_id.trim());
			await api.post<Empresa>('/empresas', payload);
			toast.exito('Comercio creado.');
			nuevoComercio = {
				nombre: '',
				direccion: '',
				telefono: '',
				slogan: '',
				categoria_id: '',
				admin_id: '',
				turnos_habilitados: true
			};
			creandoComercio = false;
			cargarComercios();
		} catch (err) {
			errorNuevoComercio = err instanceof ApiError ? err.message : 'No se pudo crear el comercio.';
			toast.error(errorNuevoComercio);
		} finally {
			guardandoComercio = false;
		}
	}

	function empezarEdicionComercio(e: Empresa) {
		editandoComercioId = e.id;
		formComercio = {
			nombre: e.nombre,
			direccion: e.direccion,
			telefono: e.telefono ?? '',
			slogan: e.slogan ?? '',
			categoria_id: String(e.categoria_id ?? ''),
			admin_id: e.admin_id != null ? String(e.admin_id) : ''
		};
		turnosComercioId = null;
	}

	async function guardarEdicionComercio(id: number) {
		if (
			!formComercio.nombre.trim() ||
			!formComercio.direccion.trim() ||
			!formComercio.categoria_id
		) {
			toast.error('Nombre, dirección y categoría son obligatorios.');
			return;
		}
		guardandoComercio = true;
		try {
			const payload: Record<string, unknown> = {
				nombre: formComercio.nombre.trim(),
				direccion: formComercio.direccion.trim(),
				telefono: formComercio.telefono.trim() || undefined,
				slogan: formComercio.slogan.trim() || undefined,
				categoria_id: Number(formComercio.categoria_id)
			};
			if (formComercio.admin_id.trim()) payload.admin_id = Number(formComercio.admin_id.trim());
			const actualizada = await api.put<Empresa>(`/empresas/${id}`, payload);
			comercios = comercios.map((c) => (c.id === id ? { ...c, ...actualizada, id } : c));
			editandoComercioId = null;
			toast.exito('Comercio actualizado.');
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el comercio.');
		} finally {
			guardandoComercio = false;
		}
	}

	function pedirEliminarComercio(e: Empresa) {
		comercioAEliminar = e;
	}

	async function confirmarEliminarComercio() {
		if (!comercioAEliminar) return;
		eliminandoComercio = true;
		try {
			await api.delete(`/empresas/${comercioAEliminar.id}`);
			toast.exito('Comercio eliminado.');
			comercios = comercios.filter((c) => c.id !== comercioAEliminar!.id);
			comercioAEliminar = null;
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar el comercio.');
		} finally {
			eliminandoComercio = false;
		}
	}

	async function quitarVerificado(e: Empresa) {
		alternandoVerificadoId = e.id;
		try {
			const res = await api.put<{ verificado: boolean }>(`/empresas/${e.id}/verificado`, {
				verificado: false
			});
			comercios = comercios.map((c) => (c.id === e.id ? { ...c, verificado: res.verificado } : c));
			toast.exito('Sello de verificado retirado.');
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo quitar el verificado.');
		} finally {
			alternandoVerificadoId = null;
		}
	}

	async function verTurnos(e: Empresa) {
		if (turnosComercioId === e.id) {
			turnosComercioId = null;
			return;
		}
		turnosComercioId = e.id;
		cargandoTurnos = true;
		try {
			turnosComercio = await api.get<TurnoRecibido[]>(`/empresas/${e.id}/turnos`);
		} catch (err) {
			console.error(err);
			toast.error(err instanceof ApiError ? err.message : 'No se pudieron cargar los turnos.');
			turnosComercio = [];
		} finally {
			cargandoTurnos = false;
		}
	}

	// ---------- Usuarios (superadmin: listar + crear admin/superadmin) ----------
	let usuarios = $state<Usuario[]>([]);
	let cargandoUsuarios = $state(false);
	let errorUsuarios = $state('');
	let usuariosCargados = $state(false);
	let nuevoUsuario = $state({ nombre: '', email: '', password: '', rol: 'admin' });
	let errorNuevoUsuario = $state('');
	let guardandoUsuario = $state(false);

	$effect(() => {
		if (tab === 'usuarios' && auth.isSuperAdmin && !usuariosCargados) cargarUsuarios();
	});

	function cargarUsuarios() {
		cargandoUsuarios = true;
		errorUsuarios = '';
		api
			.get<Usuario[]>('/usuarios')
			.then((res) => {
				usuarios = res;
				usuariosCargados = true;
			})
			.catch((err) => {
				console.error(err);
				errorUsuarios =
					err instanceof ApiError ? err.message : 'No se pudieron cargar los usuarios.';
			})
			.finally(() => (cargandoUsuarios = false));
	}

	async function crearUsuario() {
		const errors = validateForm(
			{ nombre: nuevoUsuario.nombre, email: nuevoUsuario.email, password: nuevoUsuario.password },
			{ nombre: [required()], email: [required(), email()], password: [required()] }
		);
		errorNuevoUsuario = errors.nombre ?? errors.email ?? errors.password ?? '';
		if (errorNuevoUsuario) return;
		guardandoUsuario = true;
		try {
			await api.post('/usuarios', {
				nombre: nuevoUsuario.nombre.trim(),
				email: nuevoUsuario.email.trim(),
				['contraseña']: nuevoUsuario.password,
				rol: nuevoUsuario.rol
			});
			toast.exito('Usuario creado.');
			nuevoUsuario = { nombre: '', email: '', password: '', rol: 'admin' };
			cargarUsuarios();
		} catch (err) {
			errorNuevoUsuario = err instanceof ApiError ? err.message : 'No se pudo crear el usuario.';
			toast.error(errorNuevoUsuario);
		} finally {
			guardandoUsuario = false;
		}
	}

	// ---------- Publicidades (destacados: listar + crear + borrar) ----------
	let publicidades = $state<Publicidad[]>([]);
	let cargandoPubs = $state(false);
	let errorPubs = $state('');
	let pubsCargadas = $state(false);
	let filtroPubEmpresa = $state('');
	let nuevaPub = $state({ empresa_id: '', titulo: '', descripcion: '', imagen_url: '' });
	// Vacío = colecta/evento que difunde la plataforma (RF-06), sin comercio asociado.
	let errorNuevaPub = $state('');
	let guardandoPub = $state(false);
	let pubAEliminar: Publicidad | null = $state(null);
	let eliminandoPub = $state(false);

	$effect(() => {
		if (tab === 'publicidades' && auth.isSuperAdmin && !pubsCargadas) cargarPublicidades();
	});

	function cargarPublicidades() {
		cargandoPubs = true;
		errorPubs = '';
		const qs = filtroPubEmpresa.trim()
			? `?empresa_id=${encodeURIComponent(filtroPubEmpresa.trim())}`
			: '';
		api
			.get<Publicidad[]>(`/publicidades${qs}`)
			.then((res) => {
				publicidades = res;
				pubsCargadas = true;
			})
			.catch((err) => {
				console.error(err);
				errorPubs =
					err instanceof ApiError ? err.message : 'No se pudieron cargar las publicidades.';
			})
			.finally(() => (cargandoPubs = false));
	}

	function esUrlHttpValida(valor: string): boolean {
		try {
			const url = new URL(valor.trim());
			return url.protocol === 'http:' || url.protocol === 'https:';
		} catch {
			return false;
		}
	}

	async function crearPublicidad() {
		errorNuevaPub = '';
		if (!nuevaPub.titulo.trim()) {
			errorNuevaPub = 'El título es obligatorio.';
			return;
		}
		if (!nuevaPub.descripcion.trim()) {
			errorNuevaPub = 'La descripción es obligatoria.';
			return;
		}
		if (!esUrlHttpValida(nuevaPub.imagen_url)) {
			errorNuevaPub = 'La imagen es obligatoria: pegá una URL válida http(s)://.';
			return;
		}
		guardandoPub = true;
		try {
			await api.post<Publicidad>('/publicidades', {
				empresa_id: nuevaPub.empresa_id.trim() ? Number(nuevaPub.empresa_id.trim()) : null,
				titulo: nuevaPub.titulo.trim(),
				descripcion: nuevaPub.descripcion.trim(),
				imagen_url: nuevaPub.imagen_url.trim()
			});
			toast.exito('Publicidad creada.');
			nuevaPub = { empresa_id: '', titulo: '', descripcion: '', imagen_url: '' };
			pubsCargadas = false;
			cargarPublicidades();
		} catch (err) {
			errorNuevaPub = err instanceof ApiError ? err.message : 'No se pudo crear la publicidad.';
			toast.error(errorNuevaPub);
		} finally {
			guardandoPub = false;
		}
	}

	async function confirmarEliminarPub() {
		if (!pubAEliminar) return;
		eliminandoPub = true;
		try {
			await api.delete(`/publicidades/${pubAEliminar.id}`);
			toast.exito('Publicidad eliminada.');
			publicidades = publicidades.filter((p) => p.id !== pubAEliminar!.id);
			pubAEliminar = null;
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la publicidad.');
		} finally {
			eliminandoPub = false;
		}
	}

	// ---------- Solicitudes de difusión (RF-06) ----------
	let solicitudes = $state<SolicitudPublicidad[]>([]);
	let cargandoSolicitudes = $state(false);
	let errorSolicitudes = $state('');
	let verTodasSolicitudes = $state(false);
	let resolviendoSolicitudId = $state<number | null>(null);

	function cargarSolicitudes() {
		cargandoSolicitudes = true;
		errorSolicitudes = '';
		api
			.get<SolicitudPublicidad[]>(
				`/solicitudes-publicidad${verTodasSolicitudes ? '?todas=true' : ''}`
			)
			.then((res) => (solicitudes = res))
			.catch((err) => {
				console.error(err);
				errorSolicitudes =
					err instanceof ApiError ? err.message : 'No se pudieron cargar las solicitudes.';
			})
			.finally(() => (cargandoSolicitudes = false));
	}

	$effect(() => {
		if (tab === 'solicitudes' && auth.isSuperAdmin) cargarSolicitudes();
	});

	async function resolverSolicitud(
		solicitud: SolicitudPublicidad,
		estado: 'atendida' | 'descartada'
	) {
		resolviendoSolicitudId = solicitud.id;
		errorSolicitudes = '';
		try {
			await api.put(`/solicitudes-publicidad/${solicitud.id}`, { estado });
			solicitudes = solicitudes.filter((s) => s.id !== solicitud.id);
			toast.exito(
				estado === 'atendida' ? 'Solicitud marcada como atendida.' : 'Solicitud descartada.'
			);
		} catch (err) {
			errorSolicitudes =
				err instanceof ApiError ? err.message : 'No se pudo actualizar la solicitud.';
			toast.error(errorSolicitudes);
		} finally {
			resolviendoSolicitudId = null;
		}
	}
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Administración</h1>
	<p class="mb-6 text-gray-500 dark:text-gray-400">
		Gestioná todo TL360 desde acá: comercios, usuarios, publicidades, difusiones, categorías,
		verificación y reportes.
	</p>

	<Tabs
		tabs={[
			{ id: 'verificacion', label: 'Comercios pendientes de verificación' },
			{ id: 'comercios', label: 'Comercios' },
			{ id: 'usuarios', label: 'Usuarios' },
			{ id: 'publicidades', label: 'Publicidades' },
			{ id: 'solicitudes', label: 'Solicitudes' },
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
		{:else if tab === 'comercios'}
			<Card class="p-6">
				<div class="mb-3 flex flex-wrap items-end gap-2">
					<div class="min-w-40 flex-1">
						<label
							for="admin-q"
							class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
							>Buscar</label
						>
						<input
							id="admin-q"
							bind:value={qComercio}
							placeholder="Nombre o rubro…"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						/>
					</div>
					<div class="min-w-40 flex-1">
						<label
							for="admin-cat"
							class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
							>Categoría</label
						>
						<select
							id="admin-cat"
							bind:value={filtroCategoria}
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							<option value="">Todas</option>
							{#each categorias as c (c.id)}
								<option value={String(c.id)}>{c.nombre}</option>
							{/each}
						</select>
					</div>
					<Button onclick={cargarComercios} disabled={cargandoComercios}>Buscar</Button>
					<Button
						variant="ghost"
						onclick={() => {
							creandoComercio = !creandoComercio;
						}}>Nuevo comercio</Button
					>
				</div>
				{#if creandoComercio}
					<div class="mb-4 grid gap-2 rounded-xl bg-gray-50 p-4 sm:grid-cols-2 dark:bg-gray-800/50">
						<div>
							<label
								for="nc-nombre"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Nombre *</label
							>
							<input
								id="nc-nombre"
								bind:value={nuevoComercio.nombre}
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<div>
							<label
								for="nc-dir"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Dirección *</label
							>
							<input
								id="nc-dir"
								bind:value={nuevoComercio.direccion}
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<div>
							<label
								for="nc-cat"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Categoría *</label
							>
							<select
								id="nc-cat"
								bind:value={nuevoComercio.categoria_id}
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							>
								<option value="">Elegir…</option>
								{#each categorias as c (c.id)}
									<option value={String(c.id)}>{c.nombre}</option>
								{/each}
							</select>
						</div>
						<div>
							<label
								for="nc-tel"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Teléfono</label
							>
							<input
								id="nc-tel"
								bind:value={nuevoComercio.telefono}
								placeholder="Solo números"
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<div>
							<label
								for="nc-admin"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>ID dueño (admin_id)</label
							>
							<input
								id="nc-admin"
								bind:value={nuevoComercio.admin_id}
								placeholder="Vacío = vos"
								inputmode="numeric"
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<div>
							<label
								for="nc-slogan"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Slogan</label
							>
							<input
								id="nc-slogan"
								bind:value={nuevoComercio.slogan}
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<label
							class="flex items-center gap-2 text-xs text-gray-600 sm:col-span-2 dark:text-gray-300"
						>
							<input type="checkbox" bind:checked={nuevoComercio.turnos_habilitados} />
							Acepta reservas de turnos
						</label>
						{#if errorNuevoComercio}
							<p class="text-sm text-danger-600 sm:col-span-2">{errorNuevoComercio}</p>
						{/if}
						<div class="flex gap-2 sm:col-span-2">
							<Button disabled={guardandoComercio} onclick={crearComercio}>Crear comercio</Button>
							<Button variant="ghost" onclick={() => (creandoComercio = false)}>Cancelar</Button>
						</div>
					</div>
				{/if}
				{#if errorComercios}
					<p class="mb-3 text-sm text-danger-600">{errorComercios}</p>
				{/if}
				{#if cargandoComercios}
					<p class="text-sm text-gray-400">Cargando comercios…</p>
				{:else if comercios.length === 0}
					<p class="text-sm text-gray-400">
						No hay comercios para este filtro. Probá con otra búsqueda o creá uno nuevo.
					</p>
				{:else}
					<ul class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
						{#each comercios as comercio (comercio.id)}
							<li class="py-3">
								{#if editandoComercioId === comercio.id}
									<div class="grid gap-2 sm:grid-cols-2">
										<input
											bind:value={formComercio.nombre}
											aria-label="Nombre del comercio"
											class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										/>
										<input
											bind:value={formComercio.direccion}
											aria-label="Dirección del comercio"
											class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										/>
										<input
											bind:value={formComercio.telefono}
											aria-label="Teléfono del comercio"
											class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										/>
										<input
											bind:value={formComercio.slogan}
											aria-label="Slogan del comercio"
											class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										/>
										<select
											bind:value={formComercio.categoria_id}
											aria-label="Categoría del comercio"
											class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										>
											{#each categorias as c (c.id)}
												<option value={String(c.id)}>{c.nombre}</option>
											{/each}
										</select>
										<input
											bind:value={formComercio.admin_id}
											aria-label="ID dueño del comercio"
											placeholder="ID dueño"
											class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										/>
									</div>
									<div class="mt-2 flex gap-3">
										<button
											class="text-sm font-semibold text-brand-600 hover:underline"
											onclick={() => guardarEdicionComercio(comercio.id)}>Guardar</button
										>
										<button
											class="text-sm text-gray-500 hover:underline"
											onclick={() => (editandoComercioId = null)}>Cancelar</button
										>
									</div>
								{:else}
									<div class="flex flex-wrap items-start justify-between gap-2">
										<div class="min-w-0">
											<a
												href={urlEmpresa(comercio)}
												class="font-medium text-brand-600 hover:underline dark:text-brand-400"
												>{comercio.nombre}</a
											>
											<p class="text-xs text-gray-500">
												{comercio.categoria ?? ''} · {comercio.direccion} · dueño #{comercio.admin_id ??
													'—'}
											</p>
										</div>
										<div class="flex items-center gap-2">
											{#if comercio.verificado}
												<Badge tone="success">Verificado</Badge>
											{:else}
												<Badge tone="neutral">Sin verificar</Badge>
											{/if}
										</div>
									</div>
									<div class="mt-2 flex flex-wrap gap-3 text-sm">
										<button
											class="text-brand-600 hover:underline dark:text-brand-400"
											onclick={() => empezarEdicionComercio(comercio)}>Editar</button
										>
										{#if comercio.verificado}
											<button
												class="text-brand-600 hover:underline dark:text-brand-400"
												disabled={alternandoVerificadoId === comercio.id}
												onclick={() => quitarVerificado(comercio)}
											>
												Quitar verificado
											</button>
										{/if}
										<button
											class="text-brand-600 hover:underline dark:text-brand-400"
											onclick={() => verTurnos(comercio)}
										>
											{turnosComercioId === comercio.id ? 'Ocultar turnos' : 'Ver turnos'}
										</button>
										<button
											class="text-danger-600 hover:underline"
											onclick={() => pedirEliminarComercio(comercio)}>Eliminar</button
										>
									</div>
									{#if turnosComercioId === comercio.id}
										<div class="mt-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
											{#if cargandoTurnos}
												<p class="text-gray-400">Cargando turnos…</p>
											{:else if turnosComercio.length === 0}
												<p class="text-gray-400">Sin turnos próximos.</p>
											{:else}
												<ul class="flex flex-col gap-1">
													{#each turnosComercio as t (t.id)}
														<li class="text-gray-700 dark:text-gray-200">
															{t.fecha}
															{t.hora} · {t.cliente_nombre} · {t.estado}
														</li>
													{/each}
												</ul>
											{/if}
										</div>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		{:else if tab === 'usuarios'}
			<div class="grid gap-4 lg:grid-cols-2">
				<Card class="p-6">
					<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Nuevo usuario</p>
					<p class="mb-3 text-xs text-gray-400">
						Solo el superadmin puede crear cuentas con rol admin o superadmin. El registro público
						crea clientes.
					</p>
					<div class="flex flex-col gap-2">
						<FormField label="Nombre" bind:value={nuevoUsuario.nombre} />
						<FormField label="Email" bind:value={nuevoUsuario.email} />
						<FormField label="Contraseña" type="password" bind:value={nuevoUsuario.password} />
						<div>
							<label
								for="nu-rol"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Rol</label
							>
							<select
								id="nu-rol"
								bind:value={nuevoUsuario.rol}
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							>
								<option value="admin">admin (dueño de negocio)</option>
								<option value="superadmin">superadmin (plataforma)</option>
								<option value="cliente">cliente</option>
							</select>
						</div>
						{#if errorNuevoUsuario}
							<p class="text-sm text-danger-600">{errorNuevoUsuario}</p>
						{/if}
						<Button disabled={guardandoUsuario} onclick={crearUsuario}>Crear usuario</Button>
					</div>
				</Card>
				<Card class="p-6">
					<div class="mb-3 flex items-center justify-between">
						<p class="text-sm font-semibold text-gray-700 dark:text-gray-200">
							Usuarios registrados
						</p>
						<button
							class="text-xs font-semibold text-brand-600 hover:underline"
							onclick={cargarUsuarios}>Recargar</button
						>
					</div>
					{#if errorUsuarios}
						<p class="mb-3 text-sm text-danger-600">{errorUsuarios}</p>
					{/if}
					{#if cargandoUsuarios}
						<p class="text-sm text-gray-400">Cargando…</p>
					{:else if usuarios.length === 0}
						<p class="text-sm text-gray-400">Todavía no hay usuarios para mostrar.</p>
					{:else}
						<ul
							class="flex max-h-96 flex-col divide-y divide-gray-100 overflow-auto dark:divide-gray-800"
						>
							{#each usuarios as u (u.id)}
								<li class="flex items-center justify-between gap-2 py-2">
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
											{u.nombre}
										</p>
										<p class="truncate text-xs text-gray-400">{u.email} · #{u.id}</p>
									</div>
									<Badge
										tone={u.rol === 'superadmin'
											? 'success'
											: u.rol === 'admin'
												? 'brand'
												: 'neutral'}>{u.rol}</Badge
									>
								</li>
							{/each}
						</ul>
					{/if}
					<p class="mt-3 text-xs text-gray-400">
						El backend no expone editar ni borrar usuarios: se gestionan creando y reasignando.
					</p>
				</Card>
			</div>
		{:else if tab === 'publicidades'}
			<div class="grid gap-4 lg:grid-cols-2">
				<Card class="p-6">
					<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
						Nueva publicidad destacada
					</p>
					<div class="flex flex-col gap-2">
						<div>
							<label
								for="np-empresa"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>ID del comercio (vacío = colecta de la plataforma)</label
							>
							<input
								id="np-empresa"
								bind:value={nuevaPub.empresa_id}
								inputmode="numeric"
								placeholder="Ej. 3 (o vacío)"
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<FormField label="Título" bind:value={nuevaPub.titulo} />
						<FormField label="Descripción" bind:value={nuevaPub.descripcion} />
						<FormField label="URL de imagen" bind:value={nuevaPub.imagen_url} />
						{#if errorNuevaPub}
							<p class="text-sm text-danger-600">{errorNuevaPub}</p>
						{/if}
						<Button disabled={guardandoPub} onclick={crearPublicidad}>Publicar</Button>
					</div>
				</Card>
				<Card class="p-6">
					<div class="mb-3 flex items-end gap-2">
						<div class="flex-1">
							<label
								for="pub-filtro"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Filtrar por comercio</label
							>
							<input
								id="pub-filtro"
								bind:value={filtroPubEmpresa}
								placeholder="ID comercio (vacío = todas)"
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<Button
							variant="ghost"
							onclick={() => {
								pubsCargadas = false;
								cargarPublicidades();
							}}>Filtrar</Button
						>
					</div>
					{#if errorPubs}
						<p class="mb-3 text-sm text-danger-600">{errorPubs}</p>
					{/if}
					{#if cargandoPubs}
						<p class="text-sm text-gray-400">Cargando…</p>
					{:else if publicidades.length === 0}
						<p class="text-sm text-gray-400">No hay publicidades para mostrar.</p>
					{:else}
						<ul
							class="flex max-h-96 flex-col divide-y divide-gray-100 overflow-auto dark:divide-gray-800"
						>
							{#each publicidades as p (p.id)}
								<li class="flex items-start justify-between gap-2 py-2">
									<div class="min-w-0">
										<p class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
											{p.titulo}
										</p>
										<p class="truncate text-xs text-gray-400">
											#{p.id} ·
											{p.empresa_id != null
												? `comercio #${p.empresa_id}`
												: 'colecta de la plataforma'}
										</p>
										{#if p.descripcion}
											<p class="truncate text-xs text-gray-500">{p.descripcion}</p>
										{/if}
									</div>
									<button
										class="shrink-0 text-xs font-semibold text-danger-600 hover:underline"
										onclick={() => (pubAEliminar = p)}>Eliminar</button
									>
								</li>
							{/each}
						</ul>
					{/if}
				</Card>
			</div>
		{:else if tab === 'solicitudes'}
			<Card class="p-6">
				<div class="mb-3 flex flex-wrap items-start justify-between gap-2">
					<div>
						<p class="text-sm font-semibold text-gray-700 dark:text-gray-200">
							Pedidos de difusión
						</p>
						<p class="text-xs text-gray-400 dark:text-gray-500">
							Llegaron por el canal público sin cuenta: colectas, eventos y emprendimientos.
						</p>
					</div>
					<button
						class="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
						onclick={() => (verTodasSolicitudes = !verTodasSolicitudes)}
					>
						{verTodasSolicitudes ? 'Ver solo pendientes' : 'Ver todas'}
					</button>
				</div>
				{#if errorSolicitudes}
					<p class="mb-3 text-sm text-danger-600">{errorSolicitudes}</p>
				{/if}
				{#if cargandoSolicitudes}
					<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
				{:else if solicitudes.length === 0}
					<p class="text-sm text-gray-400 dark:text-gray-500">
						{verTodasSolicitudes
							? 'Todavía no llegó ninguna solicitud.'
							: 'No hay solicitudes pendientes.'}
					</p>
				{:else}
					<ul class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
						{#each solicitudes as solicitud (solicitud.id)}
							<li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<p class="font-medium text-gray-800 dark:text-gray-100">
											{solicitud.nombre}
										</p>
										<Badge tone={solicitud.tipo === 'colecta' ? 'brand' : 'neutral'}>
											{solicitud.tipo === 'colecta' ? 'Colecta / evento' : 'Publicidad'}
										</Badge>
										{#if solicitud.estado !== 'pendiente'}
											<Badge tone="success">{solicitud.estado}</Badge>
										{/if}
									</div>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{solicitud.contacto} ·
										{new Date(solicitud.creado_en).toLocaleDateString('es-AR')}
									</p>
									<p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
										{solicitud.mensaje}
									</p>
								</div>
								{#if solicitud.estado === 'pendiente'}
									<div class="flex shrink-0 gap-3">
										<button
											disabled={resolviendoSolicitudId === solicitud.id}
											class="text-sm font-semibold text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
											onclick={() => resolverSolicitud(solicitud, 'atendida')}
										>
											Atender
										</button>
										<button
											disabled={resolviendoSolicitudId === solicitud.id}
											class="text-sm font-semibold text-danger-600 hover:underline disabled:opacity-50"
											onclick={() => resolverSolicitud(solicitud, 'descartada')}
										>
											Descartar
										</button>
									</div>
								{/if}
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

<ConfirmModal
	abierto={comercioAEliminar !== null}
	titulo="Eliminar comercio"
	descripcion={comercioAEliminar
		? `¿Eliminar “${comercioAEliminar.nombre}” (id ${comercioAEliminar.id})? No se puede eliminar si tiene turnos registrados.`
		: ''}
	confirmarTexto="Sí, eliminar"
	oncancelar={() => (comercioAEliminar = null)}
	onconfirmar={confirmarEliminarComercio}
	ocupado={eliminandoComercio}
/>

<ConfirmModal
	abierto={pubAEliminar !== null}
	titulo="Eliminar publicidad"
	descripcion={pubAEliminar ? `¿Eliminar “${pubAEliminar.titulo}” (id ${pubAEliminar.id})?` : ''}
	confirmarTexto="Sí, eliminar"
	oncancelar={() => (pubAEliminar = null)}
	onconfirmar={confirmarEliminarPub}
	ocupado={eliminandoPub}
/>
