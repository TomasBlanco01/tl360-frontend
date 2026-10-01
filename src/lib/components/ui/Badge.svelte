<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone = 'neutral',
		class: className = '',
		children
	}: {
		tone?: 'success' | 'danger' | 'brand' | 'neutral';
		class?: string;
		children: Snippet;
	} = $props();

	const tones: Record<string, string> = {
		success: 'bg-success-50 text-success-600 dark:bg-success-600/15',
		danger: 'bg-danger-50 text-danger-600 dark:bg-danger-600/15',
		brand: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
		neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold {tones[
		tone
	]} {className}"
>
	{@render children()}
</span>
