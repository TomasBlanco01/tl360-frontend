<script lang="ts">
	import type { Empresa } from '$lib/types';
	import Card from '$lib/components/ui/Card.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import RatingStars from '$lib/components/ui/RatingStars.svelte';

	let { empresa }: { empresa: Empresa } = $props();
</script>

<a href="/comercios/{empresa.id}">
	<Card hoverable class="flex h-full flex-col gap-3 p-5">
		<div class="flex items-start gap-3">
			<Avatar name={empresa.nombre} size={48} />
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<p class="truncate font-bold text-gray-800 dark:text-gray-100">{empresa.nombre}</p>
					{#if empresa.verificado}
						<Badge tone="brand">Verificado</Badge>
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
