<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import NavBar from '$lib/components/NavBar.svelte';
	import { theme } from '$lib/stores/theme.svelte';

	let { children } = $props();

	theme.apply();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div
	class="min-h-screen bg-white text-gray-800 transition-colors duration-300 dark:bg-gray-950 dark:text-gray-100"
>
	<NavBar />
	{@render children()}
</div>
