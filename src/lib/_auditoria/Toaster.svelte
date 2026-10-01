<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toast } from './toast.svelte';
	import X from '@lucide/svelte/icons/x';

	const borde = {
		exito: 'border-success-600',
		error: 'border-danger-600',
		info: 'border-brand-500'
	};
</script>

<!-- Una sola región viva: los lectores de pantalla anuncian cada aviso sin mover el foco. -->
<div
	class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
	role="status"
	aria-live="polite"
>
	{#each toast.items as t (t.id)}
		<div
			transition:fly={{ y: 16, duration: 200 }}
			class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border-l-4 bg-white p-3 text-sm text-gray-800 shadow-lg dark:bg-gray-800 dark:text-gray-100 {borde[
				t.tipo
			]}"
		>
			<p class="flex-1">{t.mensaje}</p>
			<button
				onclick={() => toast.cerrar(t.id)}
				aria-label="Cerrar aviso"
				class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/each}
</div>
