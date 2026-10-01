<script lang="ts">
	import { fly } from 'svelte/transition';
	import { api, ApiError } from '$lib/api';
	import { validateForm, required, email as emailRule } from '$lib/validation';
	import FormField from '$lib/components/FormField.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// NOTA: requiere que el backend exponga POST /auth/forgot-password (no existe todavía en
	// TpFinal-backend-main). Contra el backend actual esta llamada devuelve 404 y se muestra el
	// error real; queda lista para cuando se agregue el endpoint.

	let values = $state({ email: '' });
	let errors = $state<Record<string, string>>({});
	let apiError = $state('');
	let enviado = $state(false);
	let loading = $state(false);

	async function handleSubmit() {
		apiError = '';
		errors = validateForm(values, { email: [required(), emailRule()] });
		if (Object.keys(errors).length > 0) return;

		loading = true;
		try {
			await api.post('/auth/forgot-password', values);
			enviado = true;
		} catch (err) {
			console.error(err);
			apiError =
				err instanceof ApiError
					? err.message
					: 'No se pudo procesar la solicitud. Intentá nuevamente más tarde.';
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
		{#if enviado}
			<h1 class="mb-2 text-center text-2xl font-bold text-brand-700 dark:text-brand-400">
				Revisá tu correo
			</h1>
			<p class="text-center text-sm text-gray-600 dark:text-gray-400">
				Si el correo <b>{values.email}</b> está registrado, vas a recibir un enlace para restablecer tu
				contraseña.
			</p>
			<Button href="/auth/login" variant="outline" class="mt-6 w-full"
				>Volver a iniciar sesión</Button
			>
		{:else}
			<h1 class="mb-1 text-center text-2xl font-bold text-brand-700 dark:text-brand-400">
				Recuperar contraseña
			</h1>
			<p class="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
				Ingresá tu correo y te enviamos un enlace para restablecerla.
			</p>

			<form
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
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

				{#if apiError}
					<p class="text-center text-sm text-danger-600">{apiError}</p>
				{/if}

				<Button type="submit" size="lg" disabled={loading} class="mt-1 w-full">
					{loading ? 'Enviando...' : 'Enviar enlace'}
				</Button>
			</form>

			<p class="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
				<a href="/auth/login" class="font-bold text-brand-600 dark:text-brand-400"
					>Volver a iniciar sesión</a
				>
			</p>
		{/if}
	</div>
</div>
