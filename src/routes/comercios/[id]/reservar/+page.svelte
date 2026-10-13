<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import type { Empresa, HorariosPorDia } from '$lib/types';
	import { slotsDelDia } from '$lib/turnos';
	import { urlEmpresa } from '$lib/slug';
	import { exigirAcceso } from '$lib/auth/guard';
	import { toast } from '$lib/_auditoria/toast.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	// 1.1 Acepta id numérico o slug.
	const slugOId = $derived(page.params.id);

	let empresa = $state<Empresa | null>(null);
	let horarios = $state<HorariosPorDia>({});
	let ocupados = $state<string[]>([]);
	let fecha = $state('');
	let horaSeleccionada = $state<string | null>(null);
	let paso = $state<'fecha' | 'confirmar' | 'exito'>('fecha');
	let error = $state('');
	let reservando = $state(false);

	$effect(() => {
		exigirAcceso('auth');
	});

	$effect(() => {
		const param = slugOId;
		api.get<Empresa>(`/empresas/${param}`).then((e) => {
			if (e.turnos_habilitados === false) {
				goto(urlEmpresa(e), { replaceState: true });
				return;
			}
			empresa = e;
			api
				.get<HorariosPorDia>(`/empresas/horarios/${e.id}`)
				.then((h) => (horarios = h))
				.catch((err) => console.error(err));
		});
	});

	async function cargarOcupados() {
		if (!fecha || !empresa) return;
		try {
			const res = await api.get<{ hora: string }[]>(
				`/turnos/ocupados?empresa_id=${empresa.id}&fecha=${fecha}`
			);
			ocupados = res.map((t) => t.hora);
		} catch (err) {
			console.error(err);
		}
	}

	$effect(() => {
		if (fecha) cargarOcupados();
	});

	const slots = $derived(slotsDelDia(fecha, horarios, empresa?.duracion_turno_min || 30));

	function elegirHora(hora: string) {
		if (ocupados.includes(hora)) return;
		horaSeleccionada = hora;
		paso = 'confirmar';
	}

	async function confirmar() {
		if (!horaSeleccionada || !empresa) return;
		error = '';
		reservando = true;
		try {
			await api.post('/turnos/reservar', {
				empresa_id: empresa.id,
				fecha,
				hora: horaSeleccionada
			});
			paso = 'exito';
			toast.exito('Turno reservado correctamente.');
		} catch (err) {
			console.error(err);
			// 1.5 Si otro cliente ganó la carrera por el slot (409), avisar y refrescar la grilla
			// manteniendo el paso de confirmación para que pueda elegir otro horario.
			if (err instanceof ApiError && err.status === 409) {
				error = err.message || 'Ese horario se acaba de ocupar. Elegí otro disponible.';
				cargarOcupados();
			} else {
				error = err instanceof ApiError ? err.message : 'No se pudo reservar el turno.';
			}
			toast.error(error);
		} finally {
			reservando = false;
		}
	}
</script>

<div class="mx-auto max-w-xl px-4 py-8">
	{#if empresa}
		<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Reservar turno</h1>
		<p class="mb-6 text-gray-500 dark:text-gray-400">{empresa.nombre}</p>
	{/if}

	{#if paso === 'exito'}
		<EmptyState
			title="¡Turno reservado!"
			description="Te esperamos en la fecha y horario elegidos."
		>
			<div class="flex gap-3">
				<Button href="/cuenta" size="lg">Ver mis turnos</Button>
				<Button href="/comercios" variant="outline" size="lg">Seguir explorando</Button>
			</div>
		</EmptyState>
	{:else}
		<Card class="p-6">
			<label class="mb-4 block text-sm font-medium text-gray-700 dark:text-gray-200">
				Elegí una fecha
				<input
					type="date"
					bind:value={fecha}
					min={new Date().toISOString().split('T')[0]}
					onchange={() => (horaSeleccionada = null)}
					class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>

			{#if fecha}
				{#if slots.length === 0}
					<p class="text-center text-sm text-danger-600">
						No hay turnos disponibles para este día.
					</p>
				{:else}
					<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{#each slots as hora (hora)}
							{@const ocupado = ocupados.includes(hora)}
							<button
								class="rounded-lg p-2.5 text-center text-sm font-semibold transition {ocupado
									? 'cursor-not-allowed bg-danger-50 text-danger-600 opacity-60 dark:bg-danger-600/15'
									: horaSeleccionada === hora
										? 'bg-brand-500 text-white'
										: 'hover:bg-success-100 bg-success-50 text-success-600 dark:bg-success-600/15 dark:hover:bg-success-600/25'}"
								disabled={ocupado}
								onclick={() => elegirHora(hora)}
							>
								{hora}
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</Card>

		{#if paso === 'confirmar' && horaSeleccionada}
			<Card class="mt-4 p-6">
				<p class="mb-1 text-sm text-gray-500 dark:text-gray-400">Vas a reservar:</p>
				<p class="text-lg font-bold text-gray-800 dark:text-gray-100">
					{new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', {
						weekday: 'long',
						day: 'numeric',
						month: 'long'
					})} — {horaSeleccionada} hs
				</p>

				{#if error}
					<p class="mt-3 text-sm text-danger-600">{error}</p>
				{/if}

				<div class="mt-4 flex flex-col gap-3">
					<Button size="lg" disabled={reservando} onclick={confirmar}>
						{reservando ? 'Reservando...' : 'Confirmar reserva'}
					</Button>
				</div>
			</Card>
		{/if}
	{/if}
</div>
