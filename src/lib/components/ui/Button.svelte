<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		href,
		onclick,
		class: className = '',
		children
	}: {
		variant?: 'primary' | 'outline' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		type?: 'button' | 'submit';
		disabled?: boolean;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		children: Snippet;
	} = $props();

	const variants: Record<string, string> = {
		primary: 'bg-brand-500 text-white hover:bg-brand-600',
		outline: 'border border-brand-500 text-brand-600 hover:bg-brand-50',
		ghost: 'text-brand-600 hover:bg-brand-50',
		danger: 'border border-danger-600 text-danger-600 hover:bg-danger-50'
	};

	const sizes: Record<string, string> = {
		sm: 'px-3 py-1.5 text-sm',
		md: 'px-4 py-2 text-sm',
		lg: 'px-6 py-3 text-base'
	};

	const base =
		'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
</script>

{#if href}
	<a {href} class="{base} {variants[variant]} {sizes[size]} {className}">
		{@render children()}
	</a>
{:else}
	<button {type} {disabled} {onclick} class="{base} {variants[variant]} {sizes[size]} {className}">
		{@render children()}
	</button>
{/if}
