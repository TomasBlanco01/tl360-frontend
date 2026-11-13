<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Circle from '@lucide/svelte/icons/circle';

	/**
	 * Ayuda de UX bajo el campo de contraseña: muestra las condiciones (las mismas que valida el
	 * backend) y las va tildando mientras se escribe.
	 */
	let { password = '', id = 'requisitos-password' }: { password?: string; id?: string } = $props();

	const requisitos = $derived([
		{ texto: 'Al menos 8 caracteres', ok: password.length >= 8 },
		{ texto: 'Una letra mayúscula', ok: /[A-ZÁÉÍÓÚÑ]/.test(password) },
		{ texto: 'Una letra minúscula', ok: /[a-záéíóúñ]/.test(password) },
		{ texto: 'Un número', ok: /[0-9]/.test(password) }
	]);
</script>

<ul {id} class="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2" aria-live="polite">
	{#each requisitos as r (r.texto)}
		<li
			class="flex items-center gap-1.5 {r.ok
				? 'text-success-600'
				: 'text-gray-500 dark:text-gray-400'}"
		>
			{#if r.ok}
				<Check class="h-3.5 w-3.5" aria-hidden="true" />
			{:else}
				<Circle class="h-3 w-3" aria-hidden="true" />
			{/if}
			<span>{r.texto}<span class="sr-only">{r.ok ? ': cumplido' : ': pendiente'}</span></span>
		</li>
	{/each}
</ul>
