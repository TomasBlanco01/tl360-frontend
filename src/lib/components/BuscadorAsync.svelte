<script lang="ts" module>
	export interface OpcionBuscador {
		id: number;
		nombre: string;
		/** Texto secundario (correo, rubro, dirección…). */
		detalle?: string;
	}
</script>

<script lang="ts">
	/**
	 * Buscador con sugerencias (combobox ARIA 1.2) para elegir un usuario o un comercio por nombre
	 * en lugar de escribir su id. Consulta al backend mientras se escribe (con espera de 250 ms).
	 */
	let {
		label,
		id,
		value = $bindable(''),
		seleccionado = $bindable<OpcionBuscador | null>(null),
		buscar,
		required = false,
		placeholder = 'Escribí para buscar…',
		ayuda = '',
		error = '',
		vacio = 'Sin resultados.',
		onelegir
	}: {
		label: string;
		id: string;
		/** Id elegido, como texto ('' = ninguno). */
		value?: string;
		seleccionado?: OpcionBuscador | null;
		buscar: (texto: string) => Promise<OpcionBuscador[]>;
		required?: boolean;
		placeholder?: string;
		ayuda?: string;
		error?: string;
		vacio?: string;
		onelegir?: (opcion: OpcionBuscador | null) => void;
	} = $props();

	let texto = $state('');
	let abierto = $state(false);
	let opciones = $state<OpcionBuscador[]>([]);
	let activo = $state(-1);
	let cargando = $state(false);
	let pedido = 0;
	let raiz: HTMLDivElement | undefined = $state();

	const listaId = $derived(`${id}-opciones`);

	async function consultar(q: string) {
		const mio = ++pedido;
		cargando = true;
		try {
			const res = await buscar(q);
			if (mio !== pedido) return;
			opciones = res;
			activo = res.length > 0 ? 0 : -1;
		} catch {
			if (mio === pedido) opciones = [];
		} finally {
			if (mio === pedido) cargando = false;
		}
	}

	$effect(() => {
		if (!abierto) return;
		const q = texto;
		const t = setTimeout(() => consultar(q.trim()), 250);
		return () => clearTimeout(t);
	});

	function elegir(opcion: OpcionBuscador | null) {
		seleccionado = opcion;
		value = opcion ? String(opcion.id) : '';
		texto = '';
		abierto = false;
		onelegir?.(opcion);
	}

	function alTeclear(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			abierto = true;
			activo = Math.min(opciones.length - 1, activo + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activo = Math.max(0, activo - 1);
		} else if (e.key === 'Enter') {
			if (abierto && opciones[activo]) {
				e.preventDefault();
				elegir(opciones[activo]);
			}
		} else if (e.key === 'Escape') {
			abierto = false;
		}
	}

	$effect(() => {
		if (!abierto) return;
		const fuera = (e: PointerEvent) => {
			if (raiz && !raiz.contains(e.target as Node)) abierto = false;
		};
		document.addEventListener('pointerdown', fuera);
		return () => document.removeEventListener('pointerdown', fuera);
	});
</script>

<div class="relative" bind:this={raiz}>
	<label for={id} class="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
		{label}{#if required}<span class="text-danger-600"> *</span>{/if}
	</label>
	{#if seleccionado && !abierto}
		<div
			class="flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
		>
			<span class="min-w-0 truncate text-gray-800 dark:text-gray-100">
				{seleccionado.nombre}
				{#if seleccionado.detalle}
					<span class="text-xs text-gray-400"> · {seleccionado.detalle}</span>
				{/if}
			</span>
			<button
				type="button"
				class="shrink-0 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
				onclick={() => {
					abierto = true;
					queueMicrotask(() => document.getElementById(id)?.focus());
				}}
				aria-label="Cambiar {label.toLowerCase()}"
			>
				Cambiar
			</button>
		</div>
	{:else}
		<input
			{id}
			type="text"
			role="combobox"
			autocomplete="off"
			aria-autocomplete="list"
			aria-expanded={abierto}
			aria-controls={listaId}
			aria-activedescendant={abierto && activo >= 0 ? `${id}-op-${activo}` : undefined}
			aria-invalid={error ? true : undefined}
			{placeholder}
			bind:value={texto}
			onfocus={() => (abierto = true)}
			oninput={() => (abierto = true)}
			onkeydown={alTeclear}
			class="w-full rounded-lg border bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:bg-gray-800 dark:text-gray-100 {error
				? 'border-danger-600'
				: 'border-gray-300 dark:border-gray-600'}"
		/>
	{/if}
	{#if abierto}
		<ul
			id={listaId}
			role="listbox"
			aria-label={label}
			class="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900"
		>
			{#if cargando && opciones.length === 0}
				<li class="px-3 py-2 text-gray-400">Buscando…</li>
			{:else}
				{#each opciones as opcion, i (opcion.id)}
					<!-- El teclado se maneja en el input (patrón aria-activedescendant). -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id="{id}-op-{i}"
						role="option"
						aria-selected={String(opcion.id) === value}
						class="cursor-pointer px-3 py-1.5 {i === activo
							? 'bg-brand-50 text-brand-700 dark:bg-gray-800 dark:text-brand-300'
							: 'text-gray-700 dark:text-gray-200'}"
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => elegir(opcion)}
						onmousemove={() => (activo = i)}
					>
						{opcion.nombre}
						{#if opcion.detalle}<span class="text-xs text-gray-400"> · {opcion.detalle}</span>{/if}
					</li>
				{:else}
					<li class="px-3 py-2 text-gray-400">{vacio}</li>
				{/each}
			{/if}
		</ul>
	{/if}
	{#if error}
		<p class="mt-1 text-xs text-danger-600">{error}</p>
	{:else if ayuda}
		<p class="mt-1 text-xs text-gray-400 dark:text-gray-500">{ayuda}</p>
	{/if}
</div>
