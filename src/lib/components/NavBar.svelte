<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';
	import ThemePicker from '$lib/components/ThemePicker.svelte';
	import Menu from '@lucide/svelte/icons/menu';
	import Swal from 'sweetalert2';

	let drawerOpen = $state(false);

	const links = $derived([
		{ label: 'Inicio', path: '/' },
		{ label: 'Comercios', path: '/comercios' },
		{ label: 'Mapa', path: '/mapa' },
		...(auth.user && !auth.isAdmin && !auth.isSuperAdmin
			? [{ label: 'Mi Cuenta', path: '/cuenta' }]
			: []),
		...(auth.isAdmin ? [{ label: 'Mi Negocio', path: '/negocio' }] : []),
		...(auth.isSuperAdmin ? [{ label: 'Admin', path: '/admin' }] : [])
	] as { label: string; path: string }[]);

	async function handleLogout() {
		const result = await Swal.fire({
			title: 'Cerrar sesión',
			text: '¿Estás seguro de que deseas cerrar sesión?',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonText: 'Sí, cerrar sesión',
			cancelButtonText: 'Cancelar',
			reverseButtons: true
		});

		if (result.isConfirmed) {
			auth.logout();
			favoritos.sync();
			drawerOpen = false;
			await Swal.fire({
				title: 'Sesión cerrada',
				text: 'Has cerrado sesión correctamente.',
				icon: 'success',
				timer: 1200,
				showConfirmButton: false
			});
			goto('/auth/login');
		}
	}
</script>

<div
	class="sticky top-0 z-30 bg-white/90 shadow-sm backdrop-blur dark:bg-gray-950/90 dark:shadow-black/30"
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
					class="ml-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
					onclick={handleLogout}
				>
					Salir ({auth.user.nombre})
				</button>
			{:else}
				<a
					href="/auth/login"
					class="ml-2 rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-brand-50 hover:text-brand-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-brand-400"
					>Ingresar</a
				>
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
							class="block w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
							onclick={handleLogout}
						>
							Salir ({auth.user.nombre})
						</button>
					</li>
				{:else}
					<li>
						<a
							href="/auth/login"
							class="block px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800"
							onclick={() => (drawerOpen = false)}>Ingresar</a
						>
					</li>
					<li>
						<a
							href="/auth/register"
							class="block px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800"
							onclick={() => (drawerOpen = false)}>Registrarse</a
						>
					</li>
				{/if}
			</ul>
		</div>
	</div>
{/if}
