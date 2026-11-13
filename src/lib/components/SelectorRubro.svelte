<script lang="ts">
	import type { Rubro } from '$lib/types';
	import { normalizar } from '$lib/busqueda';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';

	/**
	 * Selector de rubro con buscador interno: hay cientos de rubros, así que se ordenan
	 * alfabéticamente y se filtran mientras se escribe ("pelu" → Peluquerías). Es un combobox
	 * accesible (ARIA 1.2): flechas para moverse, Enter para elegir, Escape para cerrar.
	 */
	let {
		rubros,
		value = $bindable(''),
		label,
		id = 'selector-rubro',
		required = false,
		/** Texto de la opción vacía ("Todos los rubros"); sin él no se puede dejar vacío. */
		opcionVacia = '',
		placeholder = 'Buscá o elegí un rubro…',
		mostrarCantidad = false,
		ocultarVacios = false,
		error = '',
		variante = 'formulario',
		onchange
	}: {
		rubros: Rubro[];
		value?: string;
		label: string;
		id?: string;
		required?: boolean;
		opcionVacia?: string;
		placeholder?: string;
		mostrarCantidad?: boolean;
		/** Oculta los rubros sin comercios (filtros del directorio). */
		ocultarVacios?: boolean;
		error?: string;
		/** `formulario` (campos de las fichas) o `pildora` (barra de filtros del directorio). */
		variante?: 'formulario' | 'pildora';
		onchange?: (value: string) => void;
	} = $props();

	let abierto = $state(false);
	let texto = $state('');
	let activo = $state(-1);
	let input: HTMLInputElement | undefined = $state();

	const ordenados = $derived(
		[...rubros]
			.filter((r) => !ocultarVacios || r.cantidad !== 0)
			.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
	);
	const seleccionado = $derived(ordenados.find((r) => String(r.id) === value) ?? null);
	const filtrados = $derived.by(() => {
		const q = normalizar(texto);
		if (!q) return ordenados;
		// Primero los que empiezan con lo escrito, después los que lo contienen.
		const empiezan = ordenados.filter((r) => normalizar(r.nombre).startsWith(q));
		const contienen = ordenados.filter(
			(r) => !normalizar(r.nombre).startsWith(q) && normalizar(r.nombre).includes(q)
		);
		return [...empiezan, ...contienen];
	});
	const opciones = $derived<({ id: ''; nombre: string } | Rubro)[]>(
		opcionVacia && !texto ? [{ id: '', nombre: opcionVacia }, ...filtrados] : filtrados
	);
	const listaId = $derived(`${id}-opciones`);

	function abrir() {
		if (abierto) return;
		abierto = true;
		texto = '';
		activo = Math.max(
			0,
			opciones.findIndex((o) => String(o.id) === value)
		);
	}

	function cerrar() {
		abierto = false;
		texto = '';
		activo = -1;
	}

	function elegir(opcion: { id: number | '' }) {
		const nuevo = String(opcion.id);
		const cambio = nuevo !== value;
		value = nuevo;
		cerrar();
		if (cambio) onchange?.(nuevo);
	}

	function alTeclear(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!abierto) abrir();
			else activo = Math.min(opciones.length - 1, activo + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activo = Math.max(0, activo - 1);
		} else if (e.key === 'Enter') {
			if (abierto && opciones[activo]) {
				e.preventDefault();
				elegir(opciones[activo]);
			}
		} else if (e.key === 'Escape') {
			if (abierto) {
				e.preventDefault();
				cerrar();
			}
		} else if (e.key === 'Tab') {
			cerrar();
		}
	}

	function alEscribir(e: Event) {
		texto = (e.currentTarget as HTMLInputElement).value;
		abierto = true;
		activo = opciones.length > 0 ? 0 : -1;
	}

	function limpiar() {
		elegir({ id: '' });
		input?.focus();
	}

	// Cierra al hacer clic fuera.
	let raiz: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!abierto) return;
		const fuera = (e: PointerEvent) => {
			if (raiz && !raiz.contains(e.target as Node)) cerrar();
		};
		document.addEventListener('pointerdown', fuera);
		return () => document.removeEventListener('pointerdown', fuera);
	});

	// Mantiene a la vista la opción activa al moverse con el teclado.
	$effect(() => {
		if (!abierto || activo < 0) return;
		document.getElementById(`${id}-op-${activo}`)?.scrollIntoView?.({ block: 'nearest' });
	});

	const claseInput = $derived(
		variante === 'pildora'
			? 'w-full rounded-full border border-gray-200 bg-white py-2.5 pr-16 pl-4 text-gray-800 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
			: `w-full rounded-lg border bg-white py-2 pr-16 pl-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:bg-gray-800 dark:text-gray-100 ${error ? 'border-danger-600' : 'border-gray-300 dark:border-gray-600'}`
	);
</script>

<div class="relative" bind:this={raiz}>
	<label
		for={id}
		class={variante === 'pildora'
			? 'sr-only'
			: 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200'}
	>
		{label}{#if required}<span class="text-danger-600"> *</span>{/if}
	</label>
	<div class="relative">
		<input
			bind:this={input}
			{id}
			type="text"
			role="combobox"
			autocomplete="off"
			aria-autocomplete="list"
			aria-expanded={abierto}
			aria-controls={listaId}
			aria-activedescendant={abierto && activo >= 0 ? `${id}-op-${activo}` : undefined}
			aria-invalid={error ? true : undefined}
			aria-required={required || undefined}
			placeholder={seleccionado ? seleccionado.nombre : opcionVacia || placeholder}
			value={abierto ? texto : (seleccionado?.nombre ?? '')}
			onfocus={abrir}
			onclick={abrir}
			oninput={alEscribir}
			onkeydown={alTeclear}
			class={claseInput}
		/>
		<div class="absolute inset-y-0 right-2 flex items-center gap-1 text-gray-400">
			{#if value && opcionVacia}
				<button
					type="button"
					onclick={limpiar}
					aria-label="Quitar el rubro elegido"
					class="rounded-full p-0.5 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
			<ChevronDown class="pointer-events-none h-4 w-4" aria-hidden="true" />
		</div>
	</div>
	{#if abierto}
		<ul
			id={listaId}
			role="listbox"
			aria-label={label}
			class="absolute z-30 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900"
		>
			{#each opciones as opcion, i (opcion.id)}
				{@const elegido = String(opcion.id) === value}
				<!-- El teclado se maneja en el input (patrón aria-activedescendant). -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{id}-op-{i}"
					role="option"
					aria-selected={elegido}
					class="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 {i === activo
						? 'bg-brand-50 text-brand-700 dark:bg-gray-800 dark:text-brand-300'
						: 'text-gray-700 dark:text-gray-200'} {elegido ? 'font-semibold' : ''}"
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => elegir(opcion)}
					onmousemove={() => (activo = i)}
				>
					<span>{opcion.nombre}</span>
					{#if mostrarCantidad && 'cantidad' in opcion && opcion.cantidad != null}
						<span class="text-xs text-gray-400 dark:text-gray-500">{opcion.cantidad}</span>
					{/if}
				</li>
			{:else}
				<li class="px-3 py-2 text-gray-400 dark:text-gray-500">
					No hay rubros que coincidan con “{texto}”.
				</li>
			{/each}
		</ul>
	{/if}
	{#if error}
		<p class="mt-1 text-xs text-danger-600">{error}</p>
	{/if}
</div>
