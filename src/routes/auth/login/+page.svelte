<script lang="ts">
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';
	import type { LoginResponse } from '$lib/types';
	import { validateForm, required, email as emailRule } from '$lib/validation';
	import FormField from '$lib/components/FormField.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let values = $state({ email: '', contraseña: '' });
	let errors = $state<Record<string, string>>({});
	let apiError = $state('');
	let loading = $state(false);

	async function handleLogin() {
		apiError = '';
		errors = validateForm(values, {
			email: [required(), emailRule()],
			contraseña: [required()]
		});
		if (Object.keys(errors).length > 0) return;

		loading = true;
		try {
			const res = await api.post<LoginResponse>('/auth/login', values);
			auth.login(res.token, res.user);
			favoritos.sync();
			goto('/');
		} catch (err) {
			console.error(err);
			apiError =
				err instanceof ApiError ? err.message : 'Credenciales inválidas o error en el servidor';
		} finally {
			loading = false;
		}
	}
</script>

<div
	class="flex min-h-[90vh] items-center justify-center bg-gradient-to-b from-brand-100 to-white px-4 dark:from-gray-900 dark:to-gray-950"
>
	<div
		class="w-full max-w-sm rounded-card bg-white p-8 shadow-[var(--shadow-card)] dark:bg-gray-900"
		transition:fly={{ y: 40, duration: 500 }}
	>
		<h1 class="mb-1 text-center text-2xl font-bold text-brand-700 dark:text-brand-400">
			Iniciar Sesión
		</h1>
		<p class="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
			Accedé a tu cuenta de TL360
		</p>

		<form
			novalidate
			onsubmit={(e) => {
				e.preventDefault();
				handleLogin();
			}}
			class="flex flex-col gap-4"
		>
			<FormField
				label="Correo electrónico"
				type="email"
				required
				bind:value={values.email}
				error={errors.email}
			/>
			<FormField
				label="Contraseña"
				type="password"
				required
				bind:value={values.contraseña}
				error={errors.contraseña}
			/>

			<div class="text-right text-sm">
				<a href="/auth/recuperar" class="font-medium text-brand-600 hover:underline">
					¿Olvidaste tu contraseña?
				</a>
			</div>

			{#if apiError}
				<p class="text-center text-sm text-danger-600">{apiError}</p>
			{/if}

			<Button type="submit" size="lg" disabled={loading} class="mt-1 w-full">
				{loading ? 'Ingresando...' : 'Iniciar Sesión'}
			</Button>
		</form>

		<p class="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
			¿No tenés cuenta?
			<a href="/auth/register" class="font-bold text-brand-600 dark:text-brand-400"
				>Registrate aquí</a
			>
		</p>
	</div>
</div>
