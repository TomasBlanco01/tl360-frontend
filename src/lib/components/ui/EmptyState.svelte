<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description = '',
		icon,
		children
	}: {
		title: string;
		description?: string;
		icon?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<div
	class="flex flex-col items-center gap-2 rounded-card bg-white p-10 text-center shadow-[var(--shadow-card)] dark:bg-gray-900"
>
	{#if icon}
		<div class="mb-1 text-brand-400">
			{@render icon()}
		</div>
	{/if}
	<p class="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</p>
	{#if description}
		<p class="text-sm text-gray-500 dark:text-gray-400">{description}</p>
	{/if}
	{#if children}
		<div class="mt-3">
			{@render children()}
		</div>
	{/if}
</div>
