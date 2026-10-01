<script lang="ts">
	let { value, count }: { value: number; count?: number } = $props();
</script>

<div class="inline-flex items-center gap-1">
	<div class="flex text-warning-500" aria-hidden="true">
		{#each Array(5) as _, i (i)}
			<svg
				viewBox="0 0 20 20"
				class="h-4 w-4"
				fill={i < Math.round(value) ? 'currentColor' : '#e5e7eb'}
			>
				<path
					d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.9l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z"
				/>
			</svg>
		{/each}
	</div>
	<span class="text-sm text-gray-500 dark:text-gray-400">
		<!-- eslint-disable-next-line svelte/no-useless-mustaches -- el espacio explícito evita que Svelte lo colapse -->
		{value.toFixed(1)}{#if count !== undefined}{' '}({count}){/if}
	</span>
</div>
