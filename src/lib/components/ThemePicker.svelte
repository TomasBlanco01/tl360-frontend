<script lang="ts">
	import { theme } from '$lib/stores/theme.svelte';
	import { ACCENT_PRESETS } from '$lib/theme';
	import Palette from '@lucide/svelte/icons/palette';
	import Plus from '@lucide/svelte/icons/plus';

	let open = $state(false);

	function togglePanel() {
		open = !open;
	}

	function elegirPreset(hex: string) {
		theme.setAccent(hex);
	}

	function elegirCustom(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		theme.setAccent(value);
	}
</script>

<div class="relative">
	<button
		class="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
		onclick={togglePanel}
		aria-label="Personalizar tema"
	>
		<Palette class="h-4.5 w-4.5" strokeWidth={1.75} />
	</button>

	{#if open}
		<div class="fixed inset-0 z-40" onclick={() => (open = false)} role="presentation"></div>

		<div
			class="absolute right-0 z-50 mt-2 w-64 rounded-card border border-gray-100 bg-white p-4 shadow-[var(--shadow-card-hover)] dark:border-gray-700 dark:bg-gray-900"
		>
			<p class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">Modo</p>
			<div class="mb-4 flex gap-2">
				<button
					class="flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition {theme.mode ===
					'light'
						? 'bg-brand-500 text-white'
						: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}"
					onclick={() => theme.setMode('light')}
				>
					Claro
				</button>
				<button
					class="flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition {theme.mode ===
					'dark'
						? 'bg-brand-500 text-white'
						: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}"
					onclick={() => theme.setMode('dark')}
				>
					Oscuro
				</button>
			</div>

			<p class="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
				Color de acento
			</p>
			<div class="flex flex-wrap gap-2">
				{#each ACCENT_PRESETS as preset (preset.id)}
					<button
						class="h-8 w-8 rounded-full ring-offset-2 ring-offset-white transition dark:ring-offset-gray-900 {theme.accent.toLowerCase() ===
						preset.hex.toLowerCase()
							? 'ring-2 ring-gray-400'
							: ''}"
						style:background={preset.hex}
						title={preset.label}
						aria-label={preset.label}
						onclick={() => elegirPreset(preset.hex)}
					></button>
				{/each}

				<label
					class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-gray-600"
					title="Color personalizado"
				>
					<input type="color" class="sr-only" value={theme.accent} oninput={elegirCustom} />
					<Plus class="h-4 w-4" />
				</label>
			</div>
		</div>
	{/if}
</div>
