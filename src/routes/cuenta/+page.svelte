<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';
	import type { Empresa, MiTurno } from '$lib/types';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import EmpresaCard from '$lib/components/EmpresaCard.svelte';

	let tab = $state('turnos');
	let turnos = $state<MiTurno[]>([]);
	let empresasFavoritas = $state<Empresa[]>([]);

	$effect(() => {
		if (!auth.user) {
			goto('/auth/login');
			return;
		}
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

	async function cancelarTurno(turnoId: number) {
		if (!confirm('¿Seguro que deseas cancelar este turno?')) return;
		try {
			await api.delete(`/turnos/cancelar/${turnoId}`);
			turnos = turnos.filter((t) => t.id !== turnoId);
		} catch (err) {
			console.error('Error cancelando turno:', err);
			alert(err instanceof ApiError ? err.message : 'No se pudo cancelar el turno.');
		}
	}

	function formatearFecha(fecha: string) {
		return new Date(fecha).toLocaleDateString('es-AR', {
			weekday: 'long',
			month: 'long',
			day: 'numeric'
		});
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
			{#if turnos.length === 0}
				<EmptyState
					title="No tenés turnos reservados"
					description="Agendá uno para no perder tu lugar."
				>
					<Button href="/comercios">Explorar comercios</Button>
				</EmptyState>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{#each turnos as turno (turno.id)}
						<Card class="border-t-4 border-brand-500 p-5 text-center">
							<p class="font-bold text-brand-700 dark:text-brand-400">
								{turno.empresa_nombre || 'Sin empresa'}
							</p>
							<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
								{formatearFecha(turno.fecha)}
							</p>
							<p class="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">
								{turno.hora.slice(0, 5)} hs
							</p>
							<Button
								variant="danger"
								size="sm"
								class="mt-3"
								onclick={() => cancelarTurno(turno.id)}
							>
								Cancelar Turno
							</Button>
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
