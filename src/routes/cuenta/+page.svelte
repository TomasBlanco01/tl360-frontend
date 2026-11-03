<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';
	import { toast } from '$lib/_auditoria/toast.svelte';
	import { exigirAcceso } from '$lib/auth/guard';
	import {
		esTurnoPasado,
		formatearFechaAR,
		required,
		email as emailRule,
		passwordSegura,
		validateForm
	} from '$lib/validation';
	import { hoyISO } from '$lib/_auditoria/fechas';
	import { activar, desactivar, detectarEstado, type EstadoPush } from '$lib/push';
	import type { Empresa, MiTurno, Usuario } from '$lib/types';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import EmpresaCard from '$lib/components/EmpresaCard.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import FormField from '$lib/components/FormField.svelte';

	// El dueño de comercio usa Mi cuenta solo para sus datos: turnos y favoritos son del cliente.
	const esCliente = $derived(auth.user?.rol === 'cliente');
	let tab = $state(auth.user && auth.user.rol !== 'cliente' ? 'datos' : 'turnos');
	const pestanas = $derived(
		esCliente
			? [
					{ id: 'turnos', label: 'Mis Turnos' },
					{ id: 'favoritos', label: 'Favoritos' },
					{ id: 'datos', label: 'Mis datos' }
				]
			: [{ id: 'datos', label: 'Mis datos' }]
	);
	// 2.6 Historial: próximos vs pasados dentro de "Mis Turnos".
	let subTab = $state<'proximos' | 'pasados'>('proximos');
	let turnos = $state<MiTurno[]>([]);
	let empresasFavoritas = $state<Empresa[]>([]);
	let estadoPush = $state<EstadoPush>('no-soportado');
	let cargandoPush = $state(false);
	const OPCIONES_RECORDATORIO = [
		{ horas: 1, texto: '1 hora antes' },
		{ horas: 3, texto: '3 horas antes' },
		{ horas: 6, texto: '6 horas antes' },
		{ horas: 12, texto: '12 horas antes' },
		{ horas: 24, texto: '1 día antes (predeterminado)' },
		{ horas: 48, texto: '2 días antes' },
		{ horas: 72, texto: '3 días antes' }
	];
	let horasRecordatorio = $state('24');
	let guardandoRecordatorio = $state(false);
	let mensajeRecordatorio = $state('');
	let errorRecordatorio = $state(false);
	const opcionesRecordatorio = $derived.by(() => {
		const horas = Number(horasRecordatorio);
		if (OPCIONES_RECORDATORIO.some((o) => o.horas === horas)) return OPCIONES_RECORDATORIO;
		return [...OPCIONES_RECORDATORIO, { horas, texto: `${horas} horas antes` }].sort(
			(a, b) => a.horas - b.horas
		);
	});

	// 2.2 Confirmación sin `confirm()` nativo.
	let turnoAPedir: MiTurno | null = $state(null);
	let cancelando = $state(false);
	let errorCancelar = $state('');

	$effect(() => {
		if (!exigirAcceso('auth')) return;
		api
			.get<MiTurno[]>('/turnos/mis-turnos')
			.then((res) => (turnos = res))
			.catch((err) => console.error('Error cargando mis turnos:', err));
	});

	$effect(() => {
		if (favoritos.ids.length === 0) {
			empresasFavoritas = [];
			return;
		}
		Promise.all(favoritos.ids.map((id) => api.get<Empresa>(`/empresas/${id}`)))
			.then((res) => (empresasFavoritas = res))
			.catch((err) => console.error(err));
	});

	$effect(() => {
		if (!exigirAcceso('auth')) return;
		let vigente = true;
		detectarEstado()
			.then((estado) => {
				if (vigente) estadoPush = estado;
			})
			.catch((err) => console.error('No se pudo consultar el estado de las notificaciones:', err));
		return () => {
			vigente = false;
		};
	});

	$effect(() => {
		if (!exigirAcceso('auth')) return;
		let vigente = true;
		api
			.get<{ horas: number }>('/usuarios/yo/recordatorio')
			.then((res) => {
				if (vigente && Number.isInteger(res.horas)) horasRecordatorio = String(res.horas);
			})
			.catch((err) => console.error('No se pudo cargar la anticipación del recordatorio:', err));
		return () => {
			vigente = false;
		};
	});

	async function activarNotificaciones() {
		cargandoPush = true;
		try {
			await activar();
			estadoPush = 'activo';
			toast.exito('Notificaciones activadas en este dispositivo.');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'No se pudieron activar las notificaciones.';
			if ('Notification' in window && Notification.permission === 'denied') {
				estadoPush = 'bloqueado';
			}
			toast.error(msg);
		} finally {
			cargandoPush = false;
		}
	}

	async function desactivarNotificaciones() {
		cargandoPush = true;
		try {
			await desactivar();
			estadoPush = 'desactivado';
			toast.exito('Notificaciones desactivadas en este dispositivo.');
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : 'No se pudieron desactivar las notificaciones.';
			toast.error(msg);
		} finally {
			cargandoPush = false;
		}
	}

	async function guardarRecordatorio() {
		guardandoRecordatorio = true;
		mensajeRecordatorio = '';
		errorRecordatorio = false;
		try {
			const horas = Number(horasRecordatorio);
			await api.put('/usuarios/yo/recordatorio', { horas });
			mensajeRecordatorio = 'Anticipación del recordatorio actualizada.';
			toast.exito(mensajeRecordatorio);
		} catch (err) {
			const msg =
				err instanceof ApiError ? err.message : 'No se pudo guardar la anticipación elegida.';
			mensajeRecordatorio = msg;
			errorRecordatorio = true;
			toast.error(msg);
		} finally {
			guardandoRecordatorio = false;
		}
	}

	function pedirCancelacion(turno: MiTurno) {
		turnoAPedir = turno;
	}

	async function confirmarCancelacion() {
		if (!turnoAPedir) return;
		cancelando = true;
		errorCancelar = '';
		try {
			// 1.5 El backend libera el slot; acá solo se refleja en la lista (reactivo, sin recarga).
			await api.delete(`/turnos/cancelar/${turnoAPedir.id}`);
			turnos = turnos.filter((t) => t.id !== turnoAPedir!.id);
			toast.exito('Turno cancelado. El horario quedó libre.');
			turnoAPedir = null;
		} catch (err) {
			console.error('Error cancelando turno:', err);
			errorCancelar = err instanceof ApiError ? err.message : 'No se pudo cancelar el turno.';
			toast.error(errorCancelar);
		} finally {
			cancelando = false;
		}
	}

	const hoy = hoyISO();
	const esProximo = (t: MiTurno) => !esTurnoPasado(t.fecha, hoy);
	const turnosProximos = $derived(
		turnos.filter(esProximo).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
	);
	const turnosPasados = $derived(
		turnos
			.filter((t) => !esProximo(t))
			.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))
	);
	const visibles = $derived(subTab === 'proximos' ? turnosProximos : turnosPasados);

	function enlaceTurno(t: MiTurno): string {
		if (t.empresa_slug) return `/comercios/${t.empresa_slug}`;
		if (t.empresa_id) return `/comercios/${t.empresa_id}`;
		return '/comercios';
	}

	function formatearFecha(fecha: string) {
		return formatearFechaAR(fecha);
	}

	// RF-09: el historial debe mostrar el estado, no solo fecha y hora.
	function estadoTurno(estado: string): {
		texto: string;
		tone: 'success' | 'danger' | 'brand' | 'neutral';
	} {
		switch (estado) {
			case 'completado':
				return { texto: 'Completado', tone: 'success' };
			case 'cancelado':
				return { texto: 'Cancelado', tone: 'danger' };
			case 'no_show':
				return { texto: 'No asistió', tone: 'neutral' };
			default:
				return { texto: 'Confirmado', tone: 'brand' };
		}
	}

	// ---------- Mis datos (editar perfil) ----------
	let nombre = $state(auth.user?.nombre ?? '');
	let email = $state(auth.user?.email ?? '');
	let erroresDatos = $state<Record<string, string>>({});
	let guardandoDatos = $state(false);
	let mensajeDatos = $state('');
	let errorDatos = $state(false);

	let actual = $state('');
	let nueva = $state('');
	let confirmar = $state('');
	let erroresPass = $state<Record<string, string>>({});
	let guardandoPass = $state(false);
	let mensajePass = $state('');
	let errorPass = $state(false);

	async function guardarDatos() {
		erroresDatos = {};
		mensajeDatos = '';
		errorDatos = false;
		const errs = validateForm(
			{ nombre, email },
			{ nombre: [required()], email: [required(), emailRule()] }
		);
		if (Object.keys(errs).length > 0) {
			erroresDatos = errs;
			return;
		}
		guardandoDatos = true;
		try {
			const perfil = await api.put<Partial<Usuario>>('/usuarios/yo', {
				nombre: nombre.trim(),
				email: email.trim()
			});
			auth.actualizar({
				nombre: perfil.nombre ?? nombre.trim(),
				email: perfil.email ?? email.trim(),
				...(perfil.email_verificado !== undefined && {
					email_verificado: perfil.email_verificado
				})
			});
			// RF-01: un correo nuevo vuelve a exigir verificación; el backend ya mandó el enlace.
			mensajeDatos =
				perfil.email_verificado === false
					? 'Datos actualizados. Te enviamos un enlace para verificar tu nuevo correo.'
					: 'Datos actualizados correctamente.';
			toast.exito(mensajeDatos);
		} catch (err) {
			const msg = err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.';
			mensajeDatos = msg;
			errorDatos = true;
			toast.error(msg);
		} finally {
			guardandoDatos = false;
		}
	}

	async function cambiarContrasena() {
		erroresPass = {};
		mensajePass = '';
		errorPass = false;
		const errs = validateForm(
			{ actual, nueva, confirmar },
			{ actual: [required()], nueva: [required(), passwordSegura()], confirmar: [required()] }
		);
		let combinados = { ...errs };
		if (!errs.confirmar && confirmar && nueva !== confirmar) {
			combinados = { ...combinados, confirmar: 'Las contraseñas no coinciden' };
		}
		if (Object.keys(combinados).length > 0) {
			erroresPass = combinados;
			return;
		}
		guardandoPass = true;
		try {
			await api.put('/usuarios/yo', { password_actual: actual, password_nueva: nueva });
			actual = '';
			nueva = '';
			confirmar = '';
			errorPass = false;
			mensajePass = 'Contraseña actualizada correctamente.';
			toast.exito('Contraseña actualizada correctamente.');
		} catch (err) {
			errorPass = true;
			const msg = err instanceof ApiError ? err.message : 'No se pudo actualizar la contraseña.';
			mensajePass = msg;
			toast.error(msg);
		} finally {
			guardandoPass = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Mi Cuenta</h1>
	{#if auth.user}
		<p class="mb-6 text-gray-500 dark:text-gray-400">{auth.user.nombre} · {auth.user.email}</p>
	{/if}
	{#if auth.user?.email_verificado === false}
		<Card class="mb-6 border-l-4 border-warning-500 p-4">
			<p class="text-sm font-semibold text-gray-800 dark:text-gray-100">
				Tu correo todavía no está verificado
			</p>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Confirmalo para poder reservar y cancelar turnos.
			</p>
			<Button
				size="sm"
				class="mt-3"
				href="/auth/verificar?email={encodeURIComponent(auth.user?.email ?? '')}"
			>
				Verificar mi cuenta
			</Button>
		</Card>
	{/if}

	{#if estadoPush !== 'no-soportado'}
		<Card class="mb-6 border-l-4 border-brand-500 p-4">
			<h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">Notificaciones</h2>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				Recibí recordatorios de tus turnos y avisos importantes en este dispositivo.
			</p>
			{#if estadoPush === 'activo'}
				<p class="mt-2 text-sm font-medium text-success-600">Activadas en este dispositivo.</p>
				<Button
					variant="outline"
					size="sm"
					class="mt-3"
					disabled={cargandoPush}
					onclick={desactivarNotificaciones}
				>
					{cargandoPush ? 'Desactivando...' : 'Desactivar notificaciones'}
				</Button>
			{:else if estadoPush === 'bloqueado'}
				<p class="mt-2 text-sm text-warning-500">
					El navegador las bloqueó. Habilitalas desde la configuración del sitio.
				</p>
			{:else}
				<Button size="sm" class="mt-3" disabled={cargandoPush} onclick={activarNotificaciones}>
					{cargandoPush ? 'Activando...' : 'Activar notificaciones'}
				</Button>
			{/if}
			<!-- RF-03: el recordatorio es de los turnos del cliente; el dueño no reserva. -->
			{#if esCliente}
				<div class="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
					<label
						for="horas-recordatorio"
						class="text-sm font-medium text-gray-700 dark:text-gray-200"
					>
						Anticipación del recordatorio
					</label>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Elegí con cuánta anticipación querés que te avisemos antes de cada turno.
					</p>
					<div class="mt-2 flex flex-wrap items-end gap-2">
						<select
							id="horas-recordatorio"
							bind:value={horasRecordatorio}
							class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							{#each opcionesRecordatorio as opcion (opcion.horas)}
								<option value={String(opcion.horas)}>{opcion.texto}</option>
							{/each}
						</select>
						<Button
							size="sm"
							variant="outline"
							disabled={guardandoRecordatorio}
							onclick={guardarRecordatorio}
						>
							{guardandoRecordatorio ? 'Guardando...' : 'Guardar recordatorio'}
						</Button>
					</div>
					{#if mensajeRecordatorio}
						<p class="mt-2 text-sm {errorRecordatorio ? 'text-danger-600' : 'text-success-600'}">
							{mensajeRecordatorio}
						</p>
					{/if}
				</div>
			{/if}
		</Card>
	{/if}

	<Tabs tabs={pestanas} bind:active={tab} />

	<div class="mt-6">
		{#if tab === 'turnos'}
			<!-- 2.6 Sub-pestañas de historial (RF-09) -->
			<div
				class="mb-4 inline-flex rounded-full border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900"
				aria-label="Historial de turnos"
			>
				<button
					aria-pressed={subTab === 'proximos'}
					onclick={() => (subTab = 'proximos')}
					class="rounded-full px-4 py-1.5 text-sm font-semibold transition {subTab === 'proximos'
						? 'bg-brand-500 text-white'
						: 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'}"
				>
					Próximos turnos ({turnosProximos.length})
				</button>
				<button
					aria-pressed={subTab === 'pasados'}
					onclick={() => (subTab = 'pasados')}
					class="rounded-full px-4 py-1.5 text-sm font-semibold transition {subTab === 'pasados'
						? 'bg-brand-500 text-white'
						: 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'}"
				>
					Turnos pasados ({turnosPasados.length})
				</button>
			</div>

			{#if errorCancelar}
				<p class="mb-4 text-sm text-danger-600" role="alert">{errorCancelar}</p>
			{/if}
			{#if visibles.length === 0}
				<EmptyState
					title={subTab === 'proximos' ? 'No tenés turnos reservados' : 'Sin historial todavía'}
					description={subTab === 'proximos'
						? 'Agendá uno para no perder tu lugar.'
						: 'Acá van a aparecer tus turnos anteriores.'}
				>
					<Button href="/comercios">Explorar comercios</Button>
				</EmptyState>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{#each visibles as turno (turno.id)}
						<Card class="border-t-4 border-brand-500 p-5 text-center">
							<a
								href={enlaceTurno(turno)}
								class="font-bold text-brand-700 hover:underline dark:text-brand-400"
							>
								{turno.empresa_nombre || 'Sin empresa'}
							</a>
							<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
								{formatearFecha(turno.fecha)}
							</p>
							<p class="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">
								{turno.hora.slice(0, 5)} hs
							</p>
							{@const estado = estadoTurno(turno.estado)}
							<div class="mt-2">
								<Badge tone={estado.tone}>{estado.texto}</Badge>
							</div>
							{#if subTab === 'proximos'}
								<Button
									variant="danger"
									size="sm"
									class="mt-3"
									onclick={() => pedirCancelacion(turno)}
								>
									Cancelar Turno
								</Button>
							{:else if turno.estado === 'confirmado' || turno.estado === 'completado'}
								{#if turno.calificado}
									<p class="mt-3 text-sm font-medium text-success-600">Calificado</p>
								{:else}
									<Button size="sm" class="mt-3" href={`${enlaceTurno(turno)}#opiniones`}>
										Calificar
									</Button>
								{/if}
							{/if}
						</Card>
					{/each}
				</div>
			{/if}
		{:else if tab === 'favoritos'}
			{#if empresasFavoritas.length === 0}
				<EmptyState
					title="Todavía no tenés favoritos"
					description="Marcá comercios con el corazón para encontrarlos rápido acá."
				>
					<Button href="/comercios">Explorar comercios</Button>
				</EmptyState>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each empresasFavoritas as empresa (empresa.id)}
						<EmpresaCard {empresa} />
					{/each}
				</div>
			{/if}
		{:else}
			<section aria-labelledby="mis-datos">
				<h2 id="mis-datos" class="sr-only">Mis datos</h2>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<Card class="p-5">
						<h3 class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
							Datos personales
						</h3>
						<form
							novalidate
							onsubmit={(e) => {
								e.preventDefault();
								guardarDatos();
							}}
							class="flex flex-col gap-3"
						>
							<FormField label="Nombre" required bind:value={nombre} error={erroresDatos.nombre} />
							<FormField
								label="Correo electrónico"
								type="email"
								required
								bind:value={email}
								error={erroresDatos.email}
							/>
							{#if mensajeDatos}
								<p class="text-sm {errorDatos ? 'text-danger-600' : 'text-success-600'}">
									{mensajeDatos}
								</p>
							{/if}
							<div>
								<Button type="submit" size="sm" disabled={guardandoDatos}>
									{guardandoDatos ? 'Guardando...' : 'Guardar cambios'}
								</Button>
							</div>
						</form>
					</Card>
					<Card class="p-5">
						<h3 class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
							Cambiar contraseña
						</h3>
						<form
							novalidate
							onsubmit={(e) => {
								e.preventDefault();
								cambiarContrasena();
							}}
							class="flex flex-col gap-3"
						>
							<FormField
								label="Contraseña actual"
								type="password"
								required
								bind:value={actual}
								error={erroresPass.actual}
							/>
							<FormField
								label="Nueva contraseña"
								type="password"
								required
								bind:value={nueva}
								error={erroresPass.nueva}
							/>
							<FormField
								label="Confirmar nueva contraseña"
								type="password"
								required
								bind:value={confirmar}
								error={erroresPass.confirmar}
							/>
							{#if mensajePass}
								<p class="text-sm {errorPass ? 'text-danger-600' : 'text-success-600'}">
									{mensajePass}
								</p>
							{/if}
							<div>
								<Button type="submit" size="sm" disabled={guardandoPass}>
									{guardandoPass ? 'Guardando...' : 'Cambiar contraseña'}
								</Button>
							</div>
						</form>
					</Card>
				</div>
			</section>
		{/if}
	</div>
</div>

<ConfirmModal
	abierto={turnoAPedir !== null}
	titulo="Cancelar turno"
	descripcion={turnoAPedir
		? `¿Seguro que deseas cancelar tu turno en ${turnoAPedir.empresa_nombre} (${turnoAPedir.hora.slice(0, 5)} hs)? El horario quedará libre para otros clientes.`
		: ''}
	confirmarTexto="Sí, cancelar"
	oncancelar={() => (turnoAPedir = null)}
	onconfirmar={confirmarCancelacion}
	ocupado={cancelando}
/>
