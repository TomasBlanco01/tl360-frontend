<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { api, ApiError } from '$lib/api';
	import { validateForm, required, minLength } from '$lib/validation';
	import FormField from '$lib/components/FormField.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// NOTA: requiere que el backend exponga POST /auth/reset-password (no existe todavía). El link
	// del mail de recuperación traería el token como ?token=...
	const token = $derived(page.url.searchParams.get('token') ?? '');

	let values = $state({ contraseña: '', confirmar: '' });
	let errors = $state<Record<string, string>>({});
	let apiError = $state('');
	let loading = $state(false);

	async function handleSubmit() {
		apiError = '';
		errors = validateForm(values, {
			contraseña: [required(), minLength(6)],
			confirmar: [required()]
		});
		if (values.contraseña !== values.confirmar) {
			errors = { ...errors, confirmar: 'Las contraseñas no coinciden' };
		}
		if (Object.keys(errors).length > 0) return;

		loading = true;
		try {
			await api.post('/auth/reset-password', { token, contraseña: values.contraseña });
			goto('/auth/login');
		} catch (err) {
			console.error(err);
			apiError = err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña.';
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
			Nueva contraseña
		</h1>
		<p class="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
			Elegí tu nueva contraseña.
		</p>

		{#if !token}
			<p class="text-center text-sm text-danger-600">
				El enlace no es válido o expiró. Solicitá uno nuevo.
			</p>
			<Button href="/auth/recuperar" variant="outline" class="mt-4 w-full">Solicitar enlace</Button>
		{:else}
			<form
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				class="flex flex-col gap-4"
			>
				<FormField
					label="Nueva contraseña"
					type="password"
					required
					bind:value={values.contraseña}
					error={errors.contraseña}
				/>
				<FormField
					label="Confirmar contraseña"
					type="password"
					required
					bind:value={values.confirmar}
					error={errors.confirmar}
				/>

				{#if apiError}
					<p class="text-center text-sm text-danger-600">{apiError}</p>
				{/if}

				<Button type="submit" size="lg" disabled={loading} class="mt-1 w-full">
					{loading ? 'Guardando...' : 'Restablecer contraseña'}
				</Button>
			</form>
		{/if}
	</div>
</div>
