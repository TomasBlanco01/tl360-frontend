<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		abierto = false,
		titulo,
		descripcion,
		confirmarTexto = 'Confirmar',
		cancelarTexto = 'Cancelar',
		variante = 'danger',
		ocupado = false,
		onconfirmar,
		oncancelar,
		children
	}: {
		abierto: boolean;
		titulo: string;
		descripcion?: string;
		confirmarTexto?: string;
		cancelarTexto?: string;
		variante?: 'danger' | 'primary';
		ocupado?: boolean;
		onconfirmar: () => void | Promise<void>;
		oncancelar: () => void;
		children?: Snippet;
	} = $props();

	let dialogo = $state<HTMLDivElement | undefined>();
	let previoFoco: Element | null = null;

	// Accesibilidad: foco al abrir, trampa de Tab, cierre con Escape,
	// bloqueo de scroll y retorno del foco al disparador.
	$effect(() => {
		if (!abierto) return;
		previoFoco = document.activeElement;
		dialogo?.focus();
		const original = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const alTeclar = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				oncancelar();
				return;
			}
			if (e.key !== 'Tab' || !dialogo) return;
			const focos = [
				...dialogo.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
			].filter((el) => !el.hasAttribute('disabled'));
			if (focos.length === 0) {
				e.preventDefault();
				return;
			}
			const primero = focos[0];
			const ultimo = focos[focos.length - 1];
			if (e.shiftKey && document.activeElement === primero) {
				e.preventDefault();
				ultimo.focus();
			} else if (!e.shiftKey && document.activeElement === ultimo) {
				e.preventDefault();
				primero.focus();
			}
		};
		window.addEventListener('keydown', alTeclar);
		return () => {
			document.body.style.overflow = original;
			window.removeEventListener('keydown', alTeclar);
			(previoFoco as HTMLElement | null)?.focus?.();
		};
	});
</script>

{#if abierto}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && oncancelar()}
	>
		<div
			bind:this={dialogo}
			role="dialog"
			aria-modal="true"
			aria-label={titulo}
			aria-describedby={descripcion ? 'confirm-modal-desc' : undefined}
			tabindex="-1"
			class="w-full max-w-sm rounded-card bg-white p-6 shadow-[var(--shadow-card-hover)] outline-none dark:bg-gray-900"
		>
			<h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">{titulo}</h2>
			{#if descripcion}
				<p id="confirm-modal-desc" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{descripcion}
				</p>
			{/if}
			{#if children}
				<div class="mt-3 text-sm text-gray-600 dark:text-gray-300">{@render children()}</div>
			{/if}
			<div class="mt-5 flex justify-end gap-2">
				<button
					type="button"
					disabled={ocupado}
					onclick={oncancelar}
					class="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
				>
					{cancelarTexto}
				</button>
				<button
					type="button"
					disabled={ocupado}
					onclick={() => onconfirmar()}
					class="rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 {variante ===
					'danger'
						? 'bg-danger-600 hover:brightness-110'
						: 'bg-brand-500 hover:bg-brand-600'}"
				>
					{ocupado ? 'Procesando…' : confirmarTexto}
				</button>
			</div>
		</div>
	</div>
{/if}
