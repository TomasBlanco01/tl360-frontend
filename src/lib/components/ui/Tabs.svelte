<script lang="ts">
	let {
		tabs,
		active = $bindable(tabs[0]?.id ?? '')
	}: {
		tabs: { id: string; label: string }[];
		active?: string;
	} = $props();
</script>

<div class="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
	{#each tabs as tab (tab.id)}
		<button
			class="shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition {active === tab.id
				? 'border-brand-500 text-brand-600 dark:text-brand-400'
				: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			onclick={() => (active = tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>
