<script lang="ts">
	import { hoyISO, sumarDias, fechaLocal } from './fechas';
	import { nombreDia, FERIADOS } from '$lib/turnos';

	let {
		horarios,
		value = $bindable(''),
		dias = 14
	}: {
		horarios: Record<string, string[]>;
		value?: string;
		dias?: number;
	} = $props();

	const opciones = $derived(
		Array.from({ length: dias }, (_, i) => {
			const iso = sumarDias(hoyISO(), i);
			const d = fechaLocal(iso);
			return {
				iso,
				abierto: (horarios[nombreDia(iso)]?.length ?? 0) > 0 && !FERIADOS.includes(iso),
				dia: d.toLocaleDateString('es-AR', { weekday: 'short' }),
				numero: d.getDate(),
				mes: d.toLocaleDateString('es-AR', { month: 'short' })
			};
		})
	);

	// Arranca en el primer día con atención: nadie tiene que adivinar qué días abre el comercio.
	$effect(() => {
		if (!value) value = opciones.find((o) => o.abierto)?.iso ?? '';
	});
</script>

<div role="radiogroup" aria-label="Elegí un día" class="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
	{#each opciones as o (o.iso)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.iso}
			aria-label="{o.dia} {o.numero} de {o.mes}{o.abierto ? '' : ', cerrado'}"
			disabled={!o.abierto}
			onclick={() => (value = o.iso)}
			class="flex w-16 shrink-0 snap-start flex-col items-center rounded-xl border py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 {value ===
			o.iso
				? 'border-brand-500 bg-brand-500 text-white'
				: 'border-gray-200 text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:text-gray-200'}"
		>
			<span class="text-xs capitalize">{o.dia}</span>
			<span class="text-lg leading-tight font-bold">{o.numero}</span>
			<span class="text-xs">{o.mes}</span>
		</button>
	{/each}
</div>
