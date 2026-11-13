<script lang="ts">
	import { descargarICS, enlaceGoogleCalendar, type EventoTurno } from '$lib/utils/ics';

	let { evento, class: className = '' }: { evento: EventoTurno; class?: string } = $props();

	const boton =
		'inline-flex items-center justify-center gap-1.5 rounded-full border border-brand-500 px-3 py-1.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-gray-800';
</script>

<div class="flex flex-wrap items-center justify-center gap-2 {className}" role="group" aria-label="Agregar el turno al calendario">
	<a
		class={boton}
		href={enlaceGoogleCalendar(evento)}
		target="_blank"
		rel="noopener noreferrer"
	>
		Google Calendar
	</a>
	<button type="button" class={boton} onclick={() => descargarICS(evento)}>
		Descargar .ics
	</button>
</div>
