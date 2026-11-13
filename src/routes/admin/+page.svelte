<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { exigirAcceso } from '$lib/auth/guard';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { urlEmpresa } from '$lib/slug';
	import type {
		Rubro,
		Empresa,
		Publicidad,
		ReporteAdmin,
		Difusion,
		EstadoAprobacion,
		TelefonoEmpresa,
		TurnoRecibido,
		Usuario
	} from '$lib/types';
	import { validateForm, required, email, passwordSegura } from '$lib/validation';
	import BuscadorAsync, { type OpcionBuscador } from '$lib/components/BuscadorAsync.svelte';
	import SelectorRubro from '$lib/components/SelectorRubro.svelte';
	import RequisitosPassword from '$lib/components/RequisitosPassword.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';

	// 1.4 La verificación comercial es la solapa principal del admin.
	let tab = $state('verificacion');

	let categorias = $state<Rubro[]>([]);
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

	// RF-15: rechazar exige un motivo (5 a 500 caracteres) que le llega al dueño.
	let rechazandoId = $state<number | null>(null);
	let motivoRechazo = $state('');
	let errorMotivo = $state('');

	function pedirRechazo(empresa: Empresa) {
		rechazandoId = empresa.id;
		motivoRechazo = '';
		errorMotivo = '';
	}

	function confirmarRechazo(empresa: Empresa) {
		const largo = motivoRechazo.trim().length;
		if (largo < 5 || largo > 500) {
			errorMotivo = 'Indicá el motivo del rechazo (entre 5 y 500 caracteres).';
			return;
		}
		resolverVerificacion(empresa, 'rechazar', motivoRechazo.trim());
	}

	async function resolverVerificacion(
		empresa: Empresa,
		accion: 'aprobar' | 'rechazar',
		motivo?: string
	) {
		procesandoId = empresa.id;
		try {
			await api.put(
				`/empresas/${empresa.id}/verificacion`,
				accion === 'rechazar' ? { accion, motivo } : { accion }
			);
			pendientes = pendientes.filter((p) => p.id !== empresa.id);
			rechazandoId = null;
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
			.get<Rubro[]>('/rubros')
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
			await api.post<Rubro>('/rubros', { nombre: nombreNueva });
			nombreNueva = '';
			toast.exito('Rubro creado.');
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo crear el rubro.';
			toast.error(mensaje);
		} finally {
			guardando = false;
		}
	}

	function empezarEdicion(categoria: Rubro) {
		editandoId = categoria.id;
		nombreEditado = categoria.nombre;
	}

	async function guardarEdicion(id: number) {
		if (!nombreEditado.trim()) return;
		mensaje = '';
		guardando = true;
		try {
			await api.put(`/rubros/${id}`, { nombre: nombreEditado });
			editandoId = null;
			toast.exito('Rubro actualizado.');
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo actualizar el rubro.';
			toast.error(mensaje);
		} finally {
			guardando = false;
		}
	}

	// 2.2 Eliminar con modal accesible, no con `confirm()` nativo.
	let categoriaAEliminar: Rubro | null = $state(null);
	let eliminando = $state(false);

	function pedirEliminar(categoria: Rubro) {
		categoriaAEliminar = categoria;
	}

	async function confirmarEliminar() {
		if (!categoriaAEliminar) return;
		eliminando = true;
		mensaje = '';
		try {
			await api.delete(`/rubros/${categoriaAEliminar.id}`);
			toast.exito('Rubro eliminado.');
			categoriaAEliminar = null;
			cargarCategorias();
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo eliminar el rubro.';
			toast.error(mensaje);
		} finally {
			eliminando = false;
		}
	}

	// ---------- Buscadores por nombre: el superadmin no tiene por qué conocer los ids ----------
	async function buscarDuenos(texto: string): Promise<OpcionBuscador[]> {
		const p = new URLSearchParams({ rol: 'admin', limit: '8' });
		if (texto) p.set('q', texto);
		const res = await api.get<Usuario[]>(`/usuarios?${p}`);
		return res.map((u) => ({ id: u.id, nombre: u.nombre, detalle: u.email }));
	}

	async function buscarComercios(texto: string): Promise<OpcionBuscador[]> {
		const p = new URLSearchParams({ limit: '8' });
		if (texto) p.set('q', texto);
		const res = await api.get<Empresa[]>(`/empresas?${p}`);
		return res.map((e) => ({ id: e.id, nombre: e.nombre, detalle: e.rubro ?? e.direccion }));
	}

	// Nombre de los dueños de los comercios listados (se piden juntos, por id).
	let nombresDuenos = $state<Record<number, string>>({});
	async function cargarNombresDuenos(lista: Empresa[]) {
		const faltan = [
			...new Set(lista.map((c) => c.usuario_id).filter((id): id is number => id != null))
		].filter((id) => !(id in nombresDuenos));
		if (faltan.length === 0) return;
		try {
			const res = await api.get<Usuario[]>(`/usuarios?ids=${faltan.join(',')}`);
			nombresDuenos = {
				...nombresDuenos,
				...Object.fromEntries(res.map((u) => [u.id, u.nombre]))
			};
		} catch {
			// Sin nombres se muestra el número de usuario.
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
		rubro_id: '',
		usuario_id: '',
		descripcion: '',
		instagram: '',
		facebook: '',
		// El dueño activa las reservas cuando carga horarios y duración del turno.
		turnos_habilitados: false
	});
	let duenoNuevo = $state<OpcionBuscador | null>(null);
	let errorNuevoComercio = $state('');
	let guardandoComercio = $state(false);

	let editandoComercioId = $state<number | null>(null);
	let formComercio = $state({
		nombre: '',
		direccion: '',
		telefono: '',
		slogan: '',
		rubro_id: '',
		usuario_id: ''
	});
	let comercioAEliminar: Empresa | null = $state(null);
	let eliminandoComercio = $state(false);
	let alternandoVerificadoId = $state<number | null>(null);

	let turnosComercioId = $state<number | null>(null);
	let turnosComercio = $state<TurnoRecibido[]>([]);
	let cargandoTurnos = $state(false);
	// Un comercio puede tener cientos de turnos: en la fila se ven los próximos y el resto en un modal.
	const TURNOS_EN_FILA = 5;
	let modalTurnos = $state<Empresa | null>(null);
	let filtroFechaTurnos = $state('');
	const turnosDelModal = $derived(
		turnosComercio.filter((t) => !filtroFechaTurnos || t.fecha === filtroFechaTurnos)
	);

	$effect(() => {
		if (tab === 'comercios' && auth.isSuperAdmin && !comerciosCargados) {
			cargarComercios();
		}
	});

	// Son miles de comercios: se listan de a 20 (se pide uno más para saber si hay otra página).
	const COMERCIOS_POR_PAGINA = 20;
	let paginaComercios = $state(0);
	let hayMasComercios = $state(false);

	function queryComercios(pagina: number) {
		const p = new URLSearchParams();
		if (qComercio.trim()) p.set('q', qComercio.trim());
		if (filtroCategoria) p.set('rubro_id', filtroCategoria);
		p.set('limit', String(COMERCIOS_POR_PAGINA + 1));
		p.set('offset', String(pagina * COMERCIOS_POR_PAGINA));
		return `/empresas?${p.toString()}`;
	}

	function cargarComercios(pagina = 0) {
		cargandoComercios = true;
		errorComercios = '';
		api
			.get<Empresa[]>(queryComercios(pagina))
			.then((res) => {
				hayMasComercios = res.length > COMERCIOS_POR_PAGINA;
				comercios = res.slice(0, COMERCIOS_POR_PAGINA);
				paginaComercios = pagina;
				comerciosCargados = true;
				cargarNombresDuenos(comercios);
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
		if (!nuevoComercio.rubro_id) {
			errorNuevoComercio = 'Elegí un rubro.';
			return;
		}
		guardandoComercio = true;
		try {
			const payload: Record<string, unknown> = {
				nombre: nuevoComercio.nombre.trim(),
				direccion: nuevoComercio.direccion.trim(),
				telefonos: nuevoComercio.telefono.trim()
					? [{ numero: nuevoComercio.telefono.trim(), principal: true }]
					: [],
				slogan: nuevoComercio.slogan.trim() || undefined,
				descripcion: nuevoComercio.descripcion.trim() || undefined,
				redes_sociales: (['instagram', 'facebook'] as const)
					.filter((tipo) => nuevoComercio[tipo].trim())
					.map((tipo) => ({ tipo, url: nuevoComercio[tipo].trim() })),
				rubro_id: Number(nuevoComercio.rubro_id),
				turnos_habilitados: nuevoComercio.turnos_habilitados
			};
			if (nuevoComercio.usuario_id.trim())
				payload.usuario_id = Number(nuevoComercio.usuario_id.trim());
			await api.post<Empresa>('/empresas', payload);
			toast.exito('Comercio creado.');
			nuevoComercio = {
				nombre: '',
				direccion: '',
				telefono: '',
				slogan: '',
				rubro_id: '',
				usuario_id: '',
				descripcion: '',
				instagram: '',
				facebook: '',
				turnos_habilitados: false
			};
			duenoNuevo = null;
			creandoComercio = false;
			cargarComercios();
		} catch (err) {
			errorNuevoComercio = err instanceof ApiError ? err.message : 'No se pudo crear el comercio.';
			toast.error(errorNuevoComercio);
		} finally {
			guardandoComercio = false;
		}
	}

	let duenoEditado = $state<OpcionBuscador | null>(null);

	/** El teléfono que se edita en la fila: el marcado como principal o, si no hay, el primero. */
	function principalDe(e: Empresa): TelefonoEmpresa | undefined {
		return e.telefonos?.find((t) => t.principal) ?? e.telefonos?.[0];
	}

	function empezarEdicionComercio(e: Empresa) {
		editandoComercioId = e.id;
		duenoEditado =
			e.usuario_id != null
				? { id: e.usuario_id, nombre: nombresDuenos[e.usuario_id] ?? `Usuario #${e.usuario_id}` }
				: null;
		formComercio = {
			nombre: e.nombre,
			direccion: e.direccion,
			telefono: principalDe(e)?.numero ?? '',
			slogan: e.slogan ?? '',
			rubro_id: String(e.rubro_id ?? ''),
			usuario_id: e.usuario_id != null ? String(e.usuario_id) : ''
		};
		turnosComercioId = null;
	}

	async function guardarEdicionComercio(id: number) {
		if (!formComercio.nombre.trim() || !formComercio.direccion.trim() || !formComercio.rubro_id) {
			toast.error('Nombre, dirección y rubro son obligatorios.');
			return;
		}
		guardandoComercio = true;
		try {
			const payload: Record<string, unknown> = {
				nombre: formComercio.nombre.trim(),
				direccion: formComercio.direccion.trim(),
				slogan: formComercio.slogan.trim() || undefined,
				rubro_id: Number(formComercio.rubro_id)
			};
			// Solo se reenvían los teléfonos si cambió el principal; los demás se conservan.
			const original = comercios.find((c) => c.id === id);
			const principal = original ? principalDe(original) : undefined;
			const numero = formComercio.telefono.trim();
			if (numero !== (principal?.numero ?? '')) {
				const otros = (original?.telefonos ?? [])
					.filter((t) => t !== principal && t.numero !== numero)
					.map((t) => ({ ...t, principal: false }));
				payload.telefonos = numero
					? [{ ...principal, id: undefined, numero, principal: true }, ...otros]
					: otros;
			}
			if (formComercio.usuario_id.trim())
				payload.usuario_id = Number(formComercio.usuario_id.trim());
			const actualizada = await api.put<Empresa>(`/empresas/${id}`, payload);
			comercios = comercios.map((c) => (c.id === id ? { ...c, ...actualizada, id } : c));
			if (duenoEditado)
				nombresDuenos = { ...nombresDuenos, [duenoEditado.id]: duenoEditado.nombre };
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
	// La lista crece con cada registro: se pagina de a 20 y se busca por nombre o correo.
	const USUARIOS_POR_PAGINA = 20;
	let qUsuario = $state('');
	let filtroRolUsuario = $state('');
	let paginaUsuarios = $state(0);
	let hayMasUsuarios = $state(false);

	// Gestión de cuentas: confirmar el correo de quien no recibió el enlace y cambiar el rol (p. ej.
	// un cliente que pasa a ser dueño de comercio). El backend pone las reglas (no quitarse el
	// propio rol, no dejar sin rol a un dueño con comercios).
	const NOMBRE_ROL: Record<Usuario['rol'], string> = {
		cliente: 'Cliente',
		admin: 'Dueño de comercio',
		superadmin: 'Superadmin'
	};
	let gestionandoUsuarioId = $state<number | null>(null);
	let cambioRol = $state<{ usuario: Usuario; rol: Usuario['rol'] } | null>(null);

	async function gestionarUsuario(
		u: Usuario,
		cambios: { rol?: Usuario['rol']; email_verificado?: true },
		exito: string
	) {
		gestionandoUsuarioId = u.id;
		try {
			const actualizado = await api.put<Usuario>(`/usuarios/${u.id}`, cambios);
			usuarios = usuarios.map((x) => (x.id === u.id ? { ...x, ...actualizado } : x));
			toast.exito(exito);
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el usuario.');
		} finally {
			gestionandoUsuarioId = null;
		}
	}

	function confirmarCorreo(u: Usuario) {
		gestionarUsuario(u, { email_verificado: true }, `Correo de ${u.nombre} confirmado.`);
	}

	async function aplicarCambioRol() {
		if (!cambioRol) return;
		const { usuario, rol } = cambioRol;
		await gestionarUsuario(usuario, { rol }, `${usuario.nombre} ahora es ${NOMBRE_ROL[rol]}.`);
		cambioRol = null;
	}
	let nuevoUsuario = $state({ nombre: '', email: '', password: '', rol: 'admin' });
	let errorNuevoUsuario = $state('');
	let guardandoUsuario = $state(false);

	$effect(() => {
		if (tab === 'usuarios' && auth.isSuperAdmin && !usuariosCargados) cargarUsuarios();
	});

	function cargarUsuarios(pagina = paginaUsuarios) {
		cargandoUsuarios = true;
		errorUsuarios = '';
		const p = new URLSearchParams({
			limit: String(USUARIOS_POR_PAGINA + 1),
			offset: String(pagina * USUARIOS_POR_PAGINA)
		});
		if (qUsuario.trim()) p.set('q', qUsuario.trim());
		if (filtroRolUsuario) p.set('rol', filtroRolUsuario);
		api
			.get<Usuario[]>(`/usuarios?${p}`)
			.then((res) => {
				hayMasUsuarios = res.length > USUARIOS_POR_PAGINA;
				usuarios = res.slice(0, USUARIOS_POR_PAGINA);
				paginaUsuarios = pagina;
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
			{
				nombre: [required()],
				email: [required(), email()],
				password: [required(), passwordSegura()]
			}
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
			cargarUsuarios(0);
		} catch (err) {
			errorNuevoUsuario = err instanceof ApiError ? err.message : 'No se pudo crear el usuario.';
			toast.error(errorNuevoUsuario);
		} finally {
			guardandoUsuario = false;
		}
	}

	// ---------- Publicidades (RF-06): bandeja de aprobación + alta directa + baja ----------
	let publicidades = $state<Publicidad[]>([]);
	let cargandoPubs = $state(false);
	let errorPubs = $state('');
	let pubsCargadas = $state(false);
	/** Filtro por nombre del comercio (o título), no por id. */
	let filtroPubEmpresa = $state('');
	let comercioNuevaPub = $state<OpcionBuscador | null>(null);
	// Por defecto se ven las que esperan aprobación.
	let filtroPubEstado = $state<EstadoAprobacion | 'todas'>('pendiente');
	let nuevaPub = $state({ empresa_id: '', titulo: '', descripcion: '', url_imagen: '' });
	let errorNuevaPub = $state('');
	let cambiandoPubId = $state<string | null>(null);

	const ETIQUETA_ESTADO: Record<EstadoAprobacion, string> = {
		pendiente: 'Pendiente',
		aprobada: 'Aprobada',
		rechazada: 'Rechazada',
		finalizada: 'Finalizada'
	};
	const TONO_ESTADO: Record<EstadoAprobacion, 'neutral' | 'brand' | 'success' | 'danger'> = {
		pendiente: 'brand',
		aprobada: 'success',
		rechazada: 'danger',
		finalizada: 'neutral'
	};
	let guardandoPub = $state(false);
	let pubAEliminar: Publicidad | null = $state(null);
	let eliminandoPub = $state(false);

	$effect(() => {
		if (tab === 'publicidades' && auth.isSuperAdmin && !pubsCargadas) cargarPublicidades();
	});

	function cargarPublicidades() {
		cargandoPubs = true;
		errorPubs = '';
		const empresa = filtroPubEmpresa.trim()
			? `&q=${encodeURIComponent(filtroPubEmpresa.trim())}`
			: '';
		api
			.get<Publicidad[]>(`/publicidades?estado=${filtroPubEstado}${empresa}`)
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
		const empresaId = Number(nuevaPub.empresa_id.trim());
		if (!Number.isInteger(empresaId) || empresaId <= 0) {
			errorNuevaPub = 'Elegí el comercio (las colectas se cargan en Difusiones).';
			return;
		}
		if (!nuevaPub.titulo.trim()) {
			errorNuevaPub = 'El título es obligatorio.';
			return;
		}
		if (!nuevaPub.descripcion.trim()) {
			errorNuevaPub = 'La descripción es obligatoria.';
			return;
		}
		if (!esUrlHttpValida(nuevaPub.url_imagen)) {
			errorNuevaPub = 'La imagen es obligatoria: pegá una URL válida http(s)://.';
			return;
		}
		guardandoPub = true;
		try {
			const creada = await api.post<Publicidad>('/publicidades', {
				empresa_id: empresaId,
				titulo: nuevaPub.titulo.trim(),
				descripcion: nuevaPub.descripcion.trim(),
				url_imagen: nuevaPub.url_imagen.trim()
			});
			toast.exito(
				creada?.estado === 'pendiente'
					? 'Publicidad creada: queda pendiente de aprobación.'
					: 'Publicidad creada y aprobada.'
			);
			nuevaPub = { empresa_id: '', titulo: '', descripcion: '', url_imagen: '' };
			comercioNuevaPub = null;
			// Recarga directa: poner pubsCargadas en false además disparaba el $effect y pedía la lista dos veces.
			cargarPublicidades();
		} catch (err) {
			errorNuevaPub = err instanceof ApiError ? err.message : 'No se pudo crear la publicidad.';
			toast.error(errorNuevaPub);
		} finally {
			guardandoPub = false;
		}
	}

	async function cambiarEstadoPub(p: Publicidad, estado: EstadoAprobacion) {
		cambiandoPubId = p.id;
		errorPubs = '';
		try {
			const actualizada = await api.put<Publicidad>(`/publicidades/${p.id}/estado`, { estado });
			// En la bandeja de un estado, la que cambió de estado sale de la lista.
			publicidades =
				filtroPubEstado === 'todas'
					? publicidades.map((x) => (x.id === p.id ? actualizada : x))
					: publicidades.filter((x) => x.id !== p.id);
			toast.exito(`Publicidad ${ETIQUETA_ESTADO[estado].toLowerCase()}.`);
		} catch (err) {
			errorPubs = err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.';
			toast.error(errorPubs);
		} finally {
			cambiandoPubId = null;
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

	// ---------- Difusiones de colectas y eventos (RF-06) ----------
	// Llegan por el canal público sin cuenta y quedan pendientes hasta que se aprueban; las que
	// carga el superadmin desde acá nacen aprobadas.
	let difusiones = $state<Difusion[]>([]);
	let cargandoDifusiones = $state(false);
	let errorDifusiones = $state('');
	let verTodasDifusiones = $state(false);
	let resolviendoDifusionId = $state<number | null>(null);
	let nuevaDifusion = $state({ tipo: 'colecta', titulo: '', descripcion: '', url_imagen: '' });
	let errorNuevaDifusion = $state('');
	let guardandoDifusion = $state(false);

	function cargarDifusiones() {
		cargandoDifusiones = true;
		errorDifusiones = '';
		api
			.get<Difusion[]>(`/difusiones?estado=${verTodasDifusiones ? 'todas' : 'pendiente'}`)
			.then((res) => (difusiones = res))
			.catch((err) => {
				console.error(err);
				errorDifusiones =
					err instanceof ApiError ? err.message : 'No se pudieron cargar las difusiones.';
			})
			.finally(() => (cargandoDifusiones = false));
	}

	$effect(() => {
		if (tab === 'difusiones' && auth.isSuperAdmin) cargarDifusiones();
	});

	async function resolverDifusion(difusion: Difusion, estado: EstadoAprobacion) {
		resolviendoDifusionId = difusion.id;
		errorDifusiones = '';
		try {
			const actualizada = await api.put<Difusion>(`/difusiones/${difusion.id}/estado`, { estado });
			difusiones = verTodasDifusiones
				? difusiones.map((d) => (d.id === difusion.id ? actualizada : d))
				: difusiones.filter((d) => d.id !== difusion.id);
			toast.exito(estado === 'aprobada' ? 'Difusión aprobada.' : 'Difusión rechazada.');
		} catch (err) {
			errorDifusiones =
				err instanceof ApiError ? err.message : 'No se pudo actualizar la difusión.';
			toast.error(errorDifusiones);
		} finally {
			resolviendoDifusionId = null;
		}
	}

	async function crearDifusion() {
		errorNuevaDifusion = '';
		if (nuevaDifusion.titulo.trim().length < 3) {
			errorNuevaDifusion = 'El título es obligatorio.';
			return;
		}
		if (nuevaDifusion.descripcion.trim().length < 10) {
			errorNuevaDifusion = 'La descripción debe tener al menos 10 caracteres.';
			return;
		}
		if (nuevaDifusion.url_imagen.trim() && !esUrlHttpValida(nuevaDifusion.url_imagen)) {
			errorNuevaDifusion = 'La imagen debe ser una URL válida http(s)://.';
			return;
		}
		guardandoDifusion = true;
		try {
			await api.post<Difusion>('/difusiones', {
				tipo: nuevaDifusion.tipo,
				titulo: nuevaDifusion.titulo.trim(),
				descripcion: nuevaDifusion.descripcion.trim(),
				url_imagen: nuevaDifusion.url_imagen.trim() || null
			});
			toast.exito('Difusión publicada.');
			nuevaDifusion = { tipo: 'colecta', titulo: '', descripcion: '', url_imagen: '' };
			cargarDifusiones();
		} catch (err) {
			errorNuevaDifusion = err instanceof ApiError ? err.message : 'No se pudo crear la difusión.';
			toast.error(errorNuevaDifusion);
		} finally {
			guardandoDifusion = false;
		}
	}

	let difusionAEliminar = $state<Difusion | null>(null);
	let eliminandoDifusion = $state(false);

	async function confirmarEliminarDifusion() {
		if (!difusionAEliminar) return;
		eliminandoDifusion = true;
		try {
			await api.delete(`/difusiones/${difusionAEliminar.id}`);
			difusiones = difusiones.filter((d) => d.id !== difusionAEliminar!.id);
			difusionAEliminar = null;
			toast.exito('Difusión eliminada.');
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la difusión.');
		} finally {
			eliminandoDifusion = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Administración</h1>
	<p class="mb-6 text-gray-500 dark:text-gray-400">
		Gestioná todo TL360 desde acá: comercios, usuarios, publicidades, difusiones, rubros,
		verificación y reportes.
	</p>

	<Tabs
		tabs={[
			{
				id: 'verificacion',
				label: `Comercios pendientes de verificación${pendientes.length ? ` (${pendientes.length})` : ''}`
			},
			{ id: 'comercios', label: 'Comercios' },
			{ id: 'usuarios', label: 'Usuarios' },
			{ id: 'publicidades', label: 'Publicidades' },
			{ id: 'difusiones', label: 'Difusiones' },
			{ id: 'categorias', label: 'Rubros' },
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
							<li
								class="flex flex-col gap-2 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
							>
								<div class="min-w-0">
									<a
										href={urlEmpresa(comercio)}
										class="font-medium text-brand-600 hover:underline dark:text-brand-400"
									>
										{comercio.nombre}
									</a>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{comercio.rubro ?? ''} · {comercio.direccion}
									</p>
									<p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
										CUIT: <span class="font-mono">{comercio.cuit ?? '—'}</span>
									</p>
									{#if comercio.url_cuit}
										<a
											href={comercio.url_cuit}
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
										onclick={() => pedirRechazo(comercio)}
										class="rounded-full border border-danger-600 px-3 py-1.5 text-xs font-semibold text-danger-600 transition hover:bg-danger-50 disabled:opacity-50 dark:hover:bg-danger-600/10"
									>
										Rechazar
									</button>
								</div>
								{#if rechazandoId === comercio.id}
									<div class="w-full rounded-lg bg-gray-50 p-3 sm:basis-full dark:bg-gray-800/60">
										<label
											for="motivo-{comercio.id}"
											class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
										>
											Motivo del rechazo <span class="text-danger-600">*</span>
										</label>
										<textarea
											id="motivo-{comercio.id}"
											bind:value={motivoRechazo}
											rows="2"
											maxlength="500"
											placeholder="Ej.: la constancia no corresponde al CUIT declarado"
											aria-invalid={errorMotivo ? 'true' : undefined}
											class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										></textarea>
										{#if errorMotivo}
											<p class="mt-1 text-xs text-danger-600" role="alert">{errorMotivo}</p>
										{/if}
										<p class="mt-1 text-xs text-gray-400">
											El dueño recibe este motivo por correo.
										</p>
										<div class="mt-2 flex gap-2">
											<button
												disabled={procesandoId === comercio.id}
												onclick={() => confirmarRechazo(comercio)}
												class="rounded-full bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
											>
												Confirmar rechazo
											</button>
											<button
												onclick={() => (rechazandoId = null)}
												class="px-3 py-1.5 text-xs text-gray-500 hover:underline"
											>
												Cancelar
											</button>
										</div>
									</div>
								{/if}
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
					<div class="min-w-48 flex-1">
						<SelectorRubro
							id="admin-cat"
							label="Filtrar por rubro"
							opcionVacia="Todos los rubros"
							rubros={categorias}
							bind:value={filtroCategoria}
						/>
					</div>
					<Button onclick={() => cargarComercios(0)} disabled={cargandoComercios}>Buscar</Button>
					<Button
						variant="ghost"
						onclick={() => {
							creandoComercio = !creandoComercio;
						}}>Nuevo comercio</Button
					>
				</div>
				{#if creandoComercio}
					<div class="mb-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
						<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
							Alta de comercio
						</p>
						<p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
							Acá se cargan los datos básicos y se asigna el dueño. Los horarios, la duración de los
							turnos, las fotos y las etiquetas los completa el dueño desde <strong
								>Mi Negocio</strong
							>: hasta que cargue sus horarios, la ficha se muestra solo con contacto, sin reservas.
							Los campos con <span class="text-danger-600">*</span> son obligatorios.
						</p>
						<div class="grid gap-3 sm:grid-cols-2">
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
							<SelectorRubro
								id="nc-cat"
								label="Rubro"
								required
								rubros={categorias}
								bind:value={nuevoComercio.rubro_id}
							/>
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
									inputmode="numeric"
									class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								/>
							</div>
							<BuscadorAsync
								id="nc-dueno"
								label="Dueño del comercio"
								placeholder="Buscá por nombre o correo…"
								ayuda="Cuentas con rol de comercio. Si lo dejás vacío, queda a tu nombre."
								vacio="No hay dueños de comercio con ese nombre. Creá la cuenta en Usuarios."
								buscar={buscarDuenos}
								bind:value={nuevoComercio.usuario_id}
								bind:seleccionado={duenoNuevo}
							/>
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
							<div>
								<label
									for="nc-instagram"
									class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
									>Instagram</label
								>
								<input
									id="nc-instagram"
									bind:value={nuevoComercio.instagram}
									placeholder="@usuario o enlace"
									class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								/>
							</div>
							<div>
								<label
									for="nc-facebook"
									class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
									>Facebook</label
								>
								<input
									id="nc-facebook"
									bind:value={nuevoComercio.facebook}
									placeholder="Enlace a la página"
									class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								/>
							</div>
							<div class="sm:col-span-2">
								<label
									for="nc-descripcion"
									class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
									>Descripción</label
								>
								<textarea
									id="nc-descripcion"
									rows="2"
									maxlength="1000"
									bind:value={nuevoComercio.descripcion}
									placeholder="Qué ofrece el comercio (el dueño la puede ampliar después)"
									class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								></textarea>
							</div>
							<label
								class="flex items-start gap-2 text-xs text-gray-600 sm:col-span-2 dark:text-gray-300"
							>
								<input
									type="checkbox"
									class="mt-0.5"
									bind:checked={nuevoComercio.turnos_habilitados}
								/>
								<span>
									Acepta reservas de turnos
									<span class="block text-gray-400">
										Las reservas empiezan cuando el dueño carga sus horarios.
									</span>
								</span>
							</label>
							{#if errorNuevoComercio}
								<p class="text-sm text-danger-600 sm:col-span-2">{errorNuevoComercio}</p>
							{/if}
							<div class="flex gap-2 sm:col-span-2">
								<Button disabled={guardandoComercio} onclick={crearComercio}>Crear comercio</Button>
								<Button variant="ghost" onclick={() => (creandoComercio = false)}>Cancelar</Button>
							</div>
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
										<SelectorRubro
											id="editar-rubro-{comercio.id}"
											label="Rubro del comercio"
											rubros={categorias}
											bind:value={formComercio.rubro_id}
										/>
										<BuscadorAsync
											id="editar-dueno-{comercio.id}"
											label="Dueño del comercio"
											placeholder="Buscá por nombre o correo…"
											buscar={buscarDuenos}
											bind:value={formComercio.usuario_id}
											bind:seleccionado={duenoEditado}
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
												{comercio.rubro ?? ''} · {comercio.direccion} · dueño: {comercio.usuario_id ==
												null
													? 'sin asignar'
													: (nombresDuenos[comercio.usuario_id] ?? `#${comercio.usuario_id}`)}
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
													{#each turnosComercio.slice(0, TURNOS_EN_FILA) as t (t.id)}
														<li class="text-gray-700 dark:text-gray-200">
															{t.fecha.split('-').reverse().join('/')}
															{t.hora.slice(0, 5)} · {t.cliente_nombre} · {t.estado}
														</li>
													{/each}
												</ul>
												{#if turnosComercio.length > TURNOS_EN_FILA}
													<button
														class="mt-2 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
														onclick={() => {
															filtroFechaTurnos = '';
															modalTurnos = comercio;
														}}
													>
														Ver todos ({turnosComercio.length})
													</button>
												{/if}
											{/if}
										</div>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
					<nav
						class="mt-3 flex items-center justify-between gap-2 text-sm"
						aria-label="Páginas de comercios"
					>
						<Button
							size="sm"
							variant="outline"
							disabled={paginaComercios === 0 || cargandoComercios}
							onclick={() => cargarComercios(paginaComercios - 1)}>← Anterior</Button
						>
						<span class="text-xs text-gray-500 dark:text-gray-400"
							>Página {paginaComercios + 1}</span
						>
						<Button
							size="sm"
							variant="outline"
							disabled={!hayMasComercios || cargandoComercios}
							onclick={() => cargarComercios(paginaComercios + 1)}>Siguiente →</Button
						>
					</nav>
				{/if}
			</Card>
		{:else if tab === 'usuarios'}
			<!-- Formulario arriba y listado abajo: la lista crece con cada registro (paginada). -->
			<Card class="p-6">
				<p class="text-sm font-semibold text-gray-700 dark:text-gray-200">Nuevo usuario</p>
				<p class="mb-3 text-xs text-gray-400">
					Solo el superadmin puede crear cuentas con rol admin o superadmin. El registro público
					crea clientes. Los campos con <span class="text-danger-600">*</span> son obligatorios.
				</p>
				<form
					novalidate
					onsubmit={(e) => {
						e.preventDefault();
						crearUsuario();
					}}
					class="grid gap-3 md:grid-cols-2 lg:grid-cols-4"
				>
					<FormField label="Nombre" id="nu-nombre" required bind:value={nuevoUsuario.nombre} />
					<FormField
						label="Email"
						id="nu-email"
						type="email"
						required
						bind:value={nuevoUsuario.email}
					/>
					<div>
						<FormField
							label="Contraseña"
							id="nu-pass"
							type="password"
							required
							bind:value={nuevoUsuario.password}
						/>
						<RequisitosPassword password={nuevoUsuario.password} id="nu-pass-requisitos" />
					</div>
					<div>
						<label
							for="nu-rol"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
							>Rol <span class="text-danger-600">*</span></label
						>
						<select
							id="nu-rol"
							bind:value={nuevoUsuario.rol}
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							<option value="admin">admin (dueño de negocio)</option>
							<option value="superadmin">superadmin (plataforma)</option>
							<option value="cliente">cliente</option>
						</select>
					</div>
					<div class="flex flex-wrap items-center gap-3 md:col-span-2 lg:col-span-4">
						<Button type="submit" disabled={guardandoUsuario}>Crear usuario</Button>
						{#if errorNuevoUsuario}
							<p class="text-sm text-danger-600">{errorNuevoUsuario}</p>
						{/if}
					</div>
				</form>
			</Card>
			<Card class="mt-4 p-6">
				<div class="mb-3 flex flex-wrap items-end gap-2">
					<p class="mr-auto text-sm font-semibold text-gray-700 dark:text-gray-200">
						Usuarios registrados
					</p>
					<form
						class="flex flex-wrap items-end gap-2"
						onsubmit={(e) => {
							e.preventDefault();
							cargarUsuarios(0);
						}}
					>
						<div>
							<label for="buscar-usuario" class="mb-1 block text-xs font-semibold text-gray-500"
								>Buscar usuario</label
							>
							<input
								id="buscar-usuario"
								type="search"
								bind:value={qUsuario}
								placeholder="Nombre o correo…"
								class="w-56 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<div>
							<label for="filtro-rol" class="mb-1 block text-xs font-semibold text-gray-500"
								>Filtrar por rol</label
							>
							<select
								id="filtro-rol"
								bind:value={filtroRolUsuario}
								onchange={() => cargarUsuarios(0)}
								class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							>
								<option value="">Todos</option>
								<option value="cliente">Clientes</option>
								<option value="admin">Dueños de comercio</option>
								<option value="superadmin">Superadmins</option>
							</select>
						</div>
						<Button type="submit" variant="ghost" size="sm">Buscar</Button>
					</form>
				</div>
				{#if errorUsuarios}
					<p class="mb-3 text-sm text-danger-600">{errorUsuarios}</p>
				{/if}
				{#if cargandoUsuarios && usuarios.length === 0}
					<p class="text-sm text-gray-400">Cargando…</p>
				{:else if usuarios.length === 0}
					<p class="text-sm text-gray-400">
						{qUsuario || filtroRolUsuario
							? 'Ningún usuario coincide con la búsqueda.'
							: 'Todavía no hay usuarios para mostrar.'}
					</p>
				{:else}
					<ul
						class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800 {cargandoUsuarios
							? 'opacity-60'
							: ''}"
					>
						{#each usuarios as u (u.id)}
							<li class="flex flex-wrap items-center justify-between gap-2 py-2">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
										{u.nombre}
										{#if u.id === auth.user?.id}<span class="text-xs font-normal text-gray-400"
												>(vos)</span
											>{/if}
									</p>
									<p class="truncate text-xs text-gray-400">{u.email}</p>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									{#if u.email_verificado === false}
										<Badge tone="danger">Correo sin verificar</Badge>
										<button
											class="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
											disabled={gestionandoUsuarioId === u.id}
											onclick={() => confirmarCorreo(u)}>Confirmar correo</button
										>
									{/if}
									<label class="sr-only" for="rol-usuario-{u.id}">Rol de {u.nombre}</label>
									<select
										id="rol-usuario-{u.id}"
										value={u.rol}
										disabled={u.id === auth.user?.id || gestionandoUsuarioId === u.id}
										title={u.id === auth.user?.id ? 'No podés cambiar tu propio rol' : undefined}
										onchange={(e) => {
											const nuevo = e.currentTarget.value as Usuario['rol'];
											e.currentTarget.value = u.rol;
											if (nuevo !== u.rol) cambioRol = { usuario: u, rol: nuevo };
										}}
										class="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
									>
										{#each Object.entries(NOMBRE_ROL) as [valor, texto] (valor)}
											<option value={valor}>{texto}</option>
										{/each}
									</select>
								</div>
							</li>
						{/each}
					</ul>
					<nav
						class="mt-3 flex items-center justify-between gap-2 text-sm"
						aria-label="Páginas de usuarios"
					>
						<Button
							size="sm"
							variant="outline"
							disabled={paginaUsuarios === 0 || cargandoUsuarios}
							onclick={() => cargarUsuarios(paginaUsuarios - 1)}>← Anterior</Button
						>
						<span class="text-xs text-gray-500 dark:text-gray-400">Página {paginaUsuarios + 1}</span
						>
						<Button
							size="sm"
							variant="outline"
							disabled={!hayMasUsuarios || cargandoUsuarios}
							onclick={() => cargarUsuarios(paginaUsuarios + 1)}>Siguiente →</Button
						>
					</nav>
				{/if}
				<p class="mt-3 text-xs text-gray-400">
					El backend no expone editar ni borrar usuarios: se gestionan creando y reasignando.
				</p>
			</Card>
		{:else if tab === 'publicidades'}
			<Card class="p-6">
				<p class="text-sm font-semibold text-gray-700 dark:text-gray-200">
					Nueva publicidad destacada
				</p>
				<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
					La que cargás acá queda aprobada. Las colectas y eventos se cargan en Difusiones. Los
					campos con <span class="text-danger-600">*</span> son obligatorios.
				</p>
				<div class="grid gap-3 md:grid-cols-2">
					<BuscadorAsync
						id="np-empresa"
						label="Comercio"
						required
						placeholder="Buscá el comercio por nombre…"
						vacio="Ningún comercio coincide."
						buscar={buscarComercios}
						bind:value={nuevaPub.empresa_id}
						bind:seleccionado={comercioNuevaPub}
					/>
					<FormField label="Título" id="np-titulo" required bind:value={nuevaPub.titulo} />
					<FormField
						label="Descripción"
						id="np-descripcion"
						required
						bind:value={nuevaPub.descripcion}
					/>
					<FormField
						label="URL de imagen"
						id="np-imagen"
						required
						placeholder="https://..."
						bind:value={nuevaPub.url_imagen}
					/>
				</div>
				<div class="mt-3 flex flex-wrap items-center gap-3">
					<Button disabled={guardandoPub} onclick={crearPublicidad}>Publicar</Button>
					{#if errorNuevaPub}
						<p class="text-sm text-danger-600">{errorNuevaPub}</p>
					{/if}
				</div>
			</Card>
			<Card class="mt-4 p-6">
				<div class="mb-3 flex flex-wrap items-end gap-2">
					<div>
						<label
							for="pub-estado"
							class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
							>Estado</label
						>
						<select
							id="pub-estado"
							bind:value={filtroPubEstado}
							onchange={cargarPublicidades}
							class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							<option value="pendiente">Pendientes de aprobación</option>
							<option value="aprobada">Aprobadas</option>
							<option value="rechazada">Rechazadas</option>
							<option value="finalizada">Finalizadas</option>
							<option value="todas">Todas</option>
						</select>
					</div>
					<form
						class="flex min-w-48 flex-1 items-end gap-2"
						onsubmit={(e) => {
							e.preventDefault();
							cargarPublicidades();
						}}
					>
						<div class="flex-1">
							<label
								for="pub-filtro"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Filtrar por comercio</label
							>
							<input
								id="pub-filtro"
								type="search"
								bind:value={filtroPubEmpresa}
								placeholder="Nombre del comercio o título (vacío = todos)"
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							/>
						</div>
						<Button type="submit" variant="ghost">Filtrar</Button>
					</form>
				</div>
				{#if errorPubs}
					<p class="mb-3 text-sm text-danger-600">{errorPubs}</p>
				{/if}
				{#if cargandoPubs}
					<p class="text-sm text-gray-400">Cargando…</p>
				{:else if publicidades.length === 0}
					<p class="text-sm text-gray-400">No hay publicidades para mostrar.</p>
				{:else}
					<ul class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
						{#each publicidades as p (p.id)}
							<li class="flex items-start justify-between gap-2 py-2">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
										{p.titulo}
									</p>
									<p class="truncate text-xs text-gray-400">
										{p.empresa_nombre ?? `comercio #${p.empresa_id}`}
									</p>
									{#if p.descripcion}
										<p class="truncate text-xs text-gray-500">{p.descripcion}</p>
									{/if}
									{#if p.estado}
										<Badge tone={TONO_ESTADO[p.estado]}>{ETIQUETA_ESTADO[p.estado]}</Badge>
									{/if}
								</div>
								<div class="flex shrink-0 flex-col items-end gap-1">
									{#if p.estado === 'pendiente'}
										<button
											disabled={cambiandoPubId === p.id}
											class="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
											onclick={() => cambiarEstadoPub(p, 'aprobada')}>Aprobar</button
										>
										<button
											disabled={cambiandoPubId === p.id}
											class="text-xs font-semibold text-danger-600 hover:underline disabled:opacity-50"
											onclick={() => cambiarEstadoPub(p, 'rechazada')}>Rechazar</button
										>
									{:else if p.estado === 'aprobada'}
										<button
											disabled={cambiandoPubId === p.id}
											class="text-xs font-semibold text-gray-500 hover:underline disabled:opacity-50"
											onclick={() => cambiarEstadoPub(p, 'finalizada')}>Finalizar</button
										>
									{/if}
									<button
										class="text-xs font-semibold text-danger-600 hover:underline"
										onclick={() => (pubAEliminar = p)}>Eliminar</button
									>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		{:else if tab === 'difusiones'}
			<div class="grid gap-4 lg:grid-cols-2">
				<Card class="p-6">
					<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
						Nueva difusión de la plataforma
					</p>
					<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
						Colectas o eventos solidarios sin comercio; la que cargás acá queda aprobada.
					</p>
					<div class="flex flex-col gap-2">
						<div>
							<label
								for="nd-tipo"
								class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300"
								>Tipo</label
							>
							<select
								id="nd-tipo"
								bind:value={nuevaDifusion.tipo}
								class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
							>
								<option value="colecta">Colecta</option>
								<option value="evento">Evento</option>
							</select>
						</div>
						<FormField label="Título" required bind:value={nuevaDifusion.titulo} />
						<FormField label="Descripción" required bind:value={nuevaDifusion.descripcion} />
						<FormField label="URL de imagen (opcional)" bind:value={nuevaDifusion.url_imagen} />
						{#if errorNuevaDifusion}
							<p class="text-sm text-danger-600">{errorNuevaDifusion}</p>
						{/if}
						<Button disabled={guardandoDifusion} onclick={crearDifusion}>Publicar</Button>
					</div>
				</Card>
				<Card class="p-6">
					<div class="mb-3 flex flex-wrap items-start justify-between gap-2">
						<div>
							<p class="text-sm font-semibold text-gray-700 dark:text-gray-200">
								Pedidos de difusión
							</p>
							<p class="text-xs text-gray-400 dark:text-gray-500">
								Llegaron por el canal público sin cuenta y esperan aprobación.
							</p>
						</div>
						<button
							class="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
							onclick={() => {
								verTodasDifusiones = !verTodasDifusiones;
								cargarDifusiones();
							}}
						>
							{verTodasDifusiones ? 'Ver solo pendientes' : 'Ver todas'}
						</button>
					</div>
					{#if errorDifusiones}
						<p class="mb-3 text-sm text-danger-600">{errorDifusiones}</p>
					{/if}
					{#if cargandoDifusiones}
						<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
					{:else if difusiones.length === 0}
						<p class="text-sm text-gray-400 dark:text-gray-500">
							{verTodasDifusiones ? 'Todavía no hay difusiones.' : 'No hay pedidos pendientes.'}
						</p>
					{:else}
						<ul class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
							{#each difusiones as difusion (difusion.id)}
								<li class="flex flex-col gap-2 py-3">
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-2">
											<p class="font-medium text-gray-800 dark:text-gray-100">{difusion.titulo}</p>
											<Badge tone="neutral">
												{difusion.tipo === 'colecta' ? 'Colecta' : 'Evento'}
											</Badge>
											<Badge tone={TONO_ESTADO[difusion.estado]}>
												{ETIQUETA_ESTADO[difusion.estado]}
											</Badge>
										</div>
										<p class="text-xs text-gray-500 dark:text-gray-400">
											{difusion.solicitante_nombre} · {difusion.solicitante_contacto} ·
											{new Date(difusion.creado_en).toLocaleDateString('es-AR')}
										</p>
										<p class="mt-1 text-sm text-gray-700 dark:text-gray-300">
											{difusion.descripcion}
										</p>
									</div>
									<div class="flex flex-wrap gap-3">
										{#if difusion.estado === 'pendiente'}
											<button
												disabled={resolviendoDifusionId === difusion.id}
												class="text-sm font-semibold text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
												onclick={() => resolverDifusion(difusion, 'aprobada')}
											>
												Aprobar
											</button>
											<button
												disabled={resolviendoDifusionId === difusion.id}
												class="text-sm font-semibold text-danger-600 hover:underline disabled:opacity-50"
												onclick={() => resolverDifusion(difusion, 'rechazada')}
											>
												Rechazar
											</button>
										{:else if difusion.estado === 'aprobada'}
											<button
												disabled={resolviendoDifusionId === difusion.id}
												class="text-sm font-semibold text-gray-500 hover:underline disabled:opacity-50"
												onclick={() => resolverDifusion(difusion, 'finalizada')}
											>
												Finalizar
											</button>
										{/if}
										<button
											class="text-sm font-semibold text-danger-600 hover:underline"
											onclick={() => (difusionAEliminar = difusion)}
										>
											Eliminar
										</button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</Card>
			</div>
		{:else if tab === 'categorias'}
			<Card class="p-6">
				<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Nuevo rubro</p>
				<div class="flex items-start gap-2">
					<div class="flex-1">
						<FormField label="Nombre" required bind:value={nombreNueva} error={errorNueva} />
					</div>
					<Button class="mt-6" disabled={guardando} onclick={crearCategoria}>Agregar</Button>
				</div>

				{#if mensaje}
					<p class="mt-3 text-sm text-danger-600">{mensaje}</p>
				{/if}
			</Card>

			<Card class="mt-4 p-6">
				<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Rubros existentes</p>
				{#if cargando}
					<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
				{:else if categorias.length === 0}
					<p class="text-sm text-gray-400 dark:text-gray-500">Todavía no hay rubros cargados.</p>
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
									<p class="text-sm text-gray-700 dark:text-gray-300">{r.descripcion}</p>
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
	abierto={cambioRol !== null}
	titulo="Cambiar rol"
	descripcion={cambioRol
		? `¿Cambiar a ${cambioRol.usuario.nombre} de ${NOMBRE_ROL[cambioRol.usuario.rol]} a ${NOMBRE_ROL[cambioRol.rol]}? Rige de inmediato: sus permisos cambian desde su próxima acción.`
		: ''}
	confirmarTexto="Sí, cambiar"
	variante="primary"
	oncancelar={() => (cambioRol = null)}
	onconfirmar={aplicarCambioRol}
	ocupado={gestionandoUsuarioId !== null}
/>

<ConfirmModal
	abierto={categoriaAEliminar !== null}
	titulo="Eliminar rubro"
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

<ConfirmModal
	abierto={difusionAEliminar !== null}
	titulo="Eliminar difusión"
	descripcion={difusionAEliminar ? `¿Eliminar “${difusionAEliminar.titulo}”?` : ''}
	confirmarTexto="Sí, eliminar"
	oncancelar={() => (difusionAEliminar = null)}
	onconfirmar={confirmarEliminarDifusion}
	ocupado={eliminandoDifusion}
/>

{#if modalTurnos}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && (modalTurnos = null)}
		onkeydown={(e) => e.key === 'Escape' && (modalTurnos = null)}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Turnos de {modalTurnos.nombre}"
			class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-card bg-white shadow-[var(--shadow-card-hover)] dark:bg-gray-900"
		>
			<div
				class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-gray-800"
			>
				<div>
					<h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">
						Turnos de {modalTurnos.nombre}
					</h2>
					<p class="text-xs text-gray-400">{turnosDelModal.length} de {turnosComercio.length}</p>
				</div>
				<div class="flex items-center gap-2">
					<label for="modal-fecha" class="text-xs font-semibold text-gray-500">Día</label>
					<input
						id="modal-fecha"
						type="date"
						bind:value={filtroFechaTurnos}
						class="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					/>
					<button
						class="rounded-full px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
						onclick={() => (modalTurnos = null)}>Cerrar</button
					>
				</div>
			</div>
			<div class="overflow-auto px-5 py-3">
				{#if turnosDelModal.length === 0}
					<p class="text-sm text-gray-400">No hay turnos ese día.</p>
				{:else}
					<table class="w-full text-left text-sm">
						<thead class="text-xs text-gray-500 uppercase">
							<tr><th class="py-1">Fecha</th><th>Hora</th><th>Cliente</th><th>Estado</th></tr>
						</thead>
						<tbody class="divide-y divide-gray-100 dark:divide-gray-800">
							{#each turnosDelModal as t (t.id)}
								<tr class="text-gray-700 dark:text-gray-200">
									<td class="py-1.5">{t.fecha.split('-').reverse().join('/')}</td>
									<td>{t.hora.slice(0, 5)}</td>
									<td>{t.cliente_nombre}</td>
									<td>{t.estado}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	</div>
{/if}
