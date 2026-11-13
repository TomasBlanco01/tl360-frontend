<script lang="ts">
	let {
		tabs,
		active = $bindable(tabs[0]?.id ?? '')
	}: {
		/** `grupo`: rótulo que separa visualmente esta solapa (y las siguientes) de las anteriores. */
		tabs: { id: string; label: string; grupo?: string }[];
		active?: string;
	} = $props();
</script>

<!-- En mobile las solapas bajan de renglón: todas quedan a la vista, también la activa. -->
<div
	class="flex flex-wrap items-end gap-x-1 border-b border-gray-200 sm:flex-nowrap sm:overflow-x-auto dark:border-gray-700"
>
	{#each tabs as tab (tab.id)}
		{#if tab.grupo}
			<span
				class="ml-2 flex shrink-0 items-center gap-2 self-center border-l border-gray-200 pl-3 text-[11px] font-semibold tracking-wide text-gray-400 uppercase dark:border-gray-700 dark:text-gray-500"
				aria-hidden="true">{tab.grupo}</span
			>
		{/if}
		<button
			class="shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition sm:px-4 sm:py-3 {active ===
			tab.id
				? 'border-brand-500 text-brand-600 dark:text-brand-400'
				: 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}"
			onclick={() => (active = tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>
