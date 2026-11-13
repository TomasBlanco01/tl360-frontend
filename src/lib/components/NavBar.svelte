<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Menu from '@lucide/svelte/icons/menu';
	import LogOut from '@lucide/svelte/icons/log-out';

	let drawerOpen = $state(false);
	let confirmarSalida = $state(false);
	let saliendo = $state(false);

	const links = $derived([
		{ label: 'Inicio', path: '/' },
		{ label: 'Comercios', path: '/comercios' },
		// 2.1 Directorio unificado: el mapa vive en /comercios?vista=mapa.
		{ label: 'Mapa', path: '/comercios?vista=mapa' },
		// RF-06: canal público para pedir la difusión de un evento o colecta.
		...(auth.isSuperAdmin ? [] : [{ label: 'Eventos y colectas', path: '/publicitar' }]),
		// El cliente y el superadmin editan sus datos desde Mi Cuenta; el dueño de comercio los tiene
		// dentro de Mi Negocio (pestaña "Mi cuenta"), así tiene todo en un solo lugar.
		...(auth.user && !auth.isAdmin ? [{ label: 'Mi Cuenta', path: '/cuenta' }] : []),
		...(auth.isAdmin ? [{ label: 'Mi Negocio', path: '/negocio' }] : []),
		...(auth.isSuperAdmin ? [{ label: 'Admin', path: '/admin' }] : [])
	] as { label: string; path: string }[]);

	function pedirSalir() {
		confirmarSalida = true;
	}

	async function confirmarLogout() {
		saliendo = true;
		try {
			auth.logout();
			favoritos.sync();
			drawerOpen = false;
			confirmarSalida = false;
			toast.exito('Sesión cerrada');
			goto('/auth/login');
		} finally {
			saliendo = false;
		}
	}
</script>

<div
	class="sticky top-0 z-40 bg-white/90 shadow-sm backdrop-blur dark:bg-gray-950/90 dark:shadow-black/30"
>
	<div class="mx-auto flex max-w-6xl items-center px-4 py-3">
		<button
			class="mr-3 flex items-center text-gray-700 md:hidden dark:text-gray-200"
			onclick={() => (drawerOpen = !drawerOpen)}
			aria-label="Abrir menú"
		>
			<Menu class="h-6 w-6" />
		</button>

		<a href="/" class="flex-1 text-lg font-extrabold text-brand-700 dark:text-brand-400">TL360</a>

		<nav class="hidden items-center gap-1 md:flex">
			{#each links as link (link.path)}
				<a
					href={link.path}
					class="rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-brand-50 hover:text-brand-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-brand-400"
				>
					{link.label}
				</a>
			{/each}

			{#if auth.user}
				<button
					class="ml-2 inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
					onclick={pedirSalir}
					aria-label="Cerrar sesión"
				>
					<LogOut class="h-4 w-4" />
					Salir ({auth.user.nombre})
				</button>
			{:else}
				<Button href="/auth/login" variant="outline" class="ml-2">Ingresar</Button>
				<a
					href="/auth/register"
					class="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
					>Registrarse</a
				>
			{/if}

			<div class="ml-1">
				<ThemePicker />
			</div>
		</nav>

		<div class="ml-2 md:hidden">
			<ThemePicker />
		</div>
	</div>
</div>

{#if drawerOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/40"
		onclick={() => (drawerOpen = false)}
		role="presentation"
	>
		<div
			class="h-full w-64 bg-white text-gray-800 shadow-xl dark:bg-gray-900 dark:text-gray-100"
			onclick={(e) => e.stopPropagation()}
		>
			<ul class="flex flex-col py-2">
				{#each links as link (link.path)}
					<li>
						<a
							href={link.path}
							class="block px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800"
							onclick={() => (drawerOpen = false)}
						>
							{link.label}
						</a>
					</li>
				{/each}
				{#if auth.user}
					<li>
						<button
							class="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
							onclick={pedirSalir}
							aria-label="Cerrar sesión"
						>
							<LogOut class="h-4 w-4" />
							Salir ({auth.user.nombre})
						</button>
					</li>
				{:else}
					<!-- Mismos estilos que en escritorio: "Ingresar" con borde y "Registrarse" relleno. -->
					<li
						class="mt-2 flex flex-col gap-2 border-t border-gray-100 px-4 pt-4 dark:border-gray-800"
					>
						<a
							href="/auth/login"
							class="rounded-full border border-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-gray-800"
							onclick={() => (drawerOpen = false)}>Ingresar</a
						>
						<a
							href="/auth/register"
							class="rounded-full bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-brand-600"
							onclick={() => (drawerOpen = false)}>Registrarse</a
						>
					</li>
				{/if}
			</ul>
		</div>
	</div>
{/if}

<ConfirmModal
	abierto={confirmarSalida}
	titulo="Cerrar sesión"
	descripcion="¿Estás seguro de que deseas cerrar sesión?"
	confirmarTexto="Sí, cerrar sesión"
	oncancelar={() => (confirmarSalida = false)}
	onconfirmar={confirmarLogout}
	ocupado={saliendo}
/>
