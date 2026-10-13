<script lang="ts">
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { api, ApiError } from '$lib/api';
	import {
		validateForm,
		required,
		email as emailRule,
		passwordSegura
	} from '$lib/validation';
	import FormField from '$lib/components/FormField.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let values = $state({
		nombre: '',
		email: '',
		contraseña: '',
		confirmar: '',
		rol: 'cliente'
	});
	let errors = $state<Record<string, string>>({});
	let apiError = $state('');
	let loading = $state(false);

	async function handleRegister() {
		apiError = '';
		errors = validateForm(values, {
			nombre: [required()],
			email: [required(), emailRule()],
			contraseña: [required(), passwordSegura()],
			confirmar: [required()]
		});
		if (values.confirmar && values.contraseña !== values.confirmar) {
			errors = { ...errors, confirmar: 'Las contraseñas no coinciden' };
		}
		if (Object.keys(errors).length > 0) return;

		loading = true;
		try {
			try {
				const chequeo = await api.get<{ existe: boolean }>(
					`/auth/existe?email=${encodeURIComponent(values.email)}`
				);
				if (chequeo && (chequeo as { existe: boolean }).existe) {
					apiError = 'Este correo ya existe';
					return;
				}
			} catch {
				// Si el backend no expone /auth/existe, el POST devuelve el 409.
			}
			await api.post('/auth/register', {
				nombre: values.nombre,
				email: values.email,
				contraseña: values.contraseña,
				rol: values.rol
			});
			goto('/auth/login');
		} catch (err) {
			console.error(err);
			apiError =
				err instanceof ApiError
					? err.message
					: 'Error al registrar el usuario. Verificá los datos.';
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
			Crear Cuenta
		</h1>
		<p class="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
			Sumate a TL360 en un minuto
		</p>

		<form
			novalidate
			onsubmit={(e) => {
				e.preventDefault();
				handleRegister();
			}}
			class="flex flex-col gap-4"
		>
			<FormField label="Nombre" required bind:value={values.nombre} error={errors.nombre} />
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
			<FormField
				label="Confirmar clave"
				type="password"
				required
				bind:value={values.confirmar}
				error={errors.confirmar}
			/>

			<div class="flex flex-col gap-1">
				<label for="rol" class="text-sm font-medium text-gray-700 dark:text-gray-200">
					Rol
				</label>
				<select
					id="rol"
					bind:value={values.rol}
					class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-800 transition outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				>
					<option value="cliente">Cliente</option>
					<option value="comercio">Comercio</option>
				</select>
			</div>

			{#if apiError}
				<p class="text-center text-sm text-danger-600">{apiError}</p>
			{/if}

			<Button type="submit" size="lg" disabled={loading} class="mt-1 w-full">
				{loading ? 'Creando cuenta...' : 'Registrarse'}
			</Button>
		</form>

		<p class="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
			¿Ya tenés cuenta?
			<a href="/auth/login" class="font-bold text-brand-600 dark:text-brand-400">Iniciá sesión</a>
		</p>
	</div>
</div>
