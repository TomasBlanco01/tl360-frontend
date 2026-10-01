<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		hoverable = false,
		class: className = '',
		children
	}: {
		hoverable?: boolean;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
	class="rounded-card bg-white shadow-[var(--shadow-card)] dark:bg-gray-900 {hoverable
		? 'transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]'
		: ''} {className}"
>
	{@render children()}
</div>
