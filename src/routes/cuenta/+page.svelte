<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';
	import { toast } from '$lib/_auditoria/toast.svelte';
	import { exigirAcceso } from '$lib/auth/guard';
	import { esTurnoPasado, formatearFechaAR } from '$lib/validation';
	import { hoyISO } from '$lib/_auditoria/fechas';
	import type { Empresa, MiTurno } from '$lib/types';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import EmpresaCard from '$lib/components/EmpresaCard.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';

	let tab = $state('turnos');
	// 2.6 Historial: próximos vs pasados dentro de "Mis Turnos".
	let subTab = $state<'proximos' | 'pasados'>('proximos');
	let turnos = $state<MiTurno[]>([]);
	let empresasFavoritas = $state<Empresa[]>([]);

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
</script>

<div class="mx-auto max-w-4xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Mi Cuenta</h1>
	{#if auth.user}
		<p class="mb-6 text-gray-500 dark:text-gray-400">{auth.user.nombre} · {auth.user.email}</p>
	{/if}

	<Tabs
		tabs={[
			{ id: 'turnos', label: 'Mis Turnos' },
			{ id: 'favoritos', label: 'Favoritos' }
		]}
		bind:active={tab}
	/>

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
							{#if subTab === 'proximos'}
								<Button
									variant="danger"
									size="sm"
									class="mt-3"
									onclick={() => pedirCancelacion(turno)}
								>
									Cancelar Turno
								</Button>
							{/if}
						</Card>
					{/each}
				</div>
			{/if}
		{:else if empresasFavoritas.length === 0}
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
