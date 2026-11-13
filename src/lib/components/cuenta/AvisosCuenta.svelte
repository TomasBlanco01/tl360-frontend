<script lang="ts">
	// Avisos de la cuenta: verificación del correo y notificaciones push (con la anticipación del
	// recordatorio para clientes). Lo usan Mi Cuenta y Mi Negocio.
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { exigirAcceso } from '$lib/auth/guard';
	import { activar, desactivar, detectarEstado, type EstadoPush } from '$lib/push';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const esCliente = $derived(auth.user?.rol === 'cliente');
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
</script>

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
			{auth.isAdmin
				? 'Recibí un aviso en este dispositivo cuando un cliente reserva o cancela en tu comercio.'
				: 'Recibí recordatorios de tus turnos y avisos importantes en este dispositivo.'}
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
