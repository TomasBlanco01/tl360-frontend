<script lang="ts">
	import type { Empresa, HorariosPorDia } from '$lib/types';
	import { api } from '$lib/api';
	import { estaAbiertoAhora } from '$lib/turnos';
	import { cacheHorarios } from '$lib/horarios-cache';
	import Card from '$lib/components/ui/Card.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import RatingStars from '$lib/components/ui/RatingStars.svelte';
	import { urlEmpresa } from '$lib/slug';

	let { empresa, horarios: horariosInicial }: { empresa: Empresa; horarios?: HorariosPorDia } =
		$props();

	// 2.4 Badge "Abierto / Cerrado" sin N+1 descontrolado: caché compartida + fetch perezoso.
	// Si el padre ya tiene los horarios, se usan; si no, se piden una vez y se memoizan.
	let horariosLocal = $state<HorariosPorDia | null>(null);

	$effect(() => {
		if (horariosInicial) {
			horariosLocal = horariosInicial;
			return;
		}
		// Solo para comercios con turnos: los "solo contacto" no necesitan badge de horario.
		if (empresa.turnos_habilitados === false) return;
		const enCache = cacheHorarios.get(empresa.id);
		if (enCache) {
			horariosLocal = enCache;
			return;
		}
		const idComercio = empresa.id;
		const slugOId = empresa.slug || empresa.id;
		let vivo = true;
		api
			.get<HorariosPorDia>(`/empresas/horarios/${slugOId}`)
			.then((h) => {
				if (!vivo) return;
				if (h && typeof h === 'object' && !Array.isArray(h)) {
					cacheHorarios.set(idComercio, h);
					horariosLocal = h;
				}
			})
			.catch(() => {});
		return () => {
			vivo = false;
		};
	});

	const abierto = $derived(horariosLocal ? estaAbiertoAhora(horariosLocal) : null);
	const verificado = $derived(empresa.verificado || empresa.verificado_estado === 'verificado');
</script>

<a href={urlEmpresa(empresa)}>
	<Card hoverable class="flex h-full flex-col gap-3 p-5">
		<div class="flex items-start gap-3">
			<Avatar name={empresa.nombre} size={48} />
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<p class="truncate font-bold text-gray-800 dark:text-gray-100">{empresa.nombre}</p>
					{#if verificado}
						<Badge tone="brand">Verificado</Badge>
					{/if}
					{#if abierto === true}
						<Badge tone="success">● Abierto ahora</Badge>
					{:else if abierto === false}
						<Badge tone="neutral">○ Cerrado</Badge>
					{/if}
				</div>
				{#if empresa.categoria}
					<p class="text-xs text-gray-400 dark:text-gray-500">{empresa.categoria}</p>
				{/if}
			</div>
		</div>

		{#if empresa.slogan}
			<p class="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{empresa.slogan}</p>
		{/if}

		<div class="mt-auto flex items-center justify-between gap-2 pt-1">
			{#if empresa.calificacion_promedio}
				<RatingStars value={empresa.calificacion_promedio} count={empresa.calificacion_cantidad} />
			{:else}
				<span class="text-xs text-gray-400 dark:text-gray-500">Sin calificaciones aún</span>
			{/if}
			{#if empresa.turnos_habilitados === false}
				<Badge tone="neutral">Solo contacto</Badge>
			{/if}
		</div>
	</Card>
</a>
